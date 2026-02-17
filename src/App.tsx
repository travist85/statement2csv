import { useMemo, useState } from "react";

type Transaction = {
  date: string; // ISO YYYY-MM-DD (normalized)
  description: string;
  amount: number; // signed (debit negative, credit positive)
  currency?: string;
  balance?: number;
};

type ParseResponse = {
  ok: boolean;
  transactions: Transaction[];
  warnings?: string[];
  confidence?: number;
  debug?: Record<string, unknown>;
};

type ExportFormat = "signed" | "split";
type SignConvention = "native" | "inverted";
type ExportOptions = {
  includeCurrency: boolean;
  format: ExportFormat;
  signConvention: SignConvention;
};

type ExportRow = {
  date: string;
  description: string;
  amount?: number;
  debit?: number;
  credit?: number;
  currency?: string;
  balance?: number;
};

type ThemeName = "classic" | "ledger" | "signal";
type Theme = {
  pageBg: string;
  pageFg: string;
  panelBg: string;
  panelBorder: string;
  muted: string;
  accent: string;
  heading: string;
  tableHeaderBg: string;
  tableRowBorder: string;
  tableRowAlt: string;
  controlBg: string;
  controlActiveBg: string;
  controlBorder: string;
  fontBody: string;
  fontHeading: string;
};

const THEMES: Record<ThemeName, Theme> = {
  classic: {
    pageBg: "#f7f7f7",
    pageFg: "#0f172a",
    panelBg: "#ffffff",
    panelBorder: "#e2e8f0",
    muted: "#475569",
    accent: "#1d4ed8",
    heading: "#0f172a",
    tableHeaderBg: "#f8fafc",
    tableRowBorder: "#e2e8f0",
    tableRowAlt: "#fbfdff",
    controlBg: "#ffffff",
    controlActiveBg: "#e8f0ff",
    controlBorder: "#cbd5e1",
    fontBody: "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif",
    fontHeading: "'Space Grotesk', 'Segoe UI', system-ui, sans-serif",
  },
  ledger: {
    pageBg: "#f3f4ee",
    pageFg: "#1b1f1c",
    panelBg: "#fcfcf8",
    panelBorder: "#d2d8c8",
    muted: "#50574c",
    accent: "#335c3b",
    heading: "#1e3423",
    tableHeaderBg: "#f2f5ec",
    tableRowBorder: "#d8ded0",
    tableRowAlt: "#f9faf4",
    controlBg: "#fbfcf6",
    controlActiveBg: "#e7efe0",
    controlBorder: "#bfcbb5",
    fontBody: "'Source Sans 3', 'Segoe UI', system-ui, sans-serif",
    fontHeading: "'Fraunces', Georgia, serif",
  },
  signal: {
    pageBg: "#0b1220",
    pageFg: "#dbe6ff",
    panelBg: "#111b2e",
    panelBorder: "#27344d",
    muted: "#9cb1d9",
    accent: "#22d3ee",
    heading: "#f8fbff",
    tableHeaderBg: "#122036",
    tableRowBorder: "#24354f",
    tableRowAlt: "#0f1a2d",
    controlBg: "#13203a",
    controlActiveBg: "#1b305a",
    controlBorder: "#2d4164",
    fontBody: "'Space Grotesk', 'Segoe UI', system-ui, sans-serif",
    fontHeading: "'Sora', 'Segoe UI', system-ui, sans-serif",
  },
};

async function getUploadUrl(file: File): Promise<{ uploadUrl: string; key: string }> {
  const resp = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentType: file.type || "application/pdf" }),
  });
  if (!resp.ok) throw new Error(`upload-url failed: ${resp.status}`);
  return resp.json();
}

async function uploadToR2(uploadUrl: string, file: File): Promise<void> {
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/pdf" },
    body: file,
  });
  if (!put.ok) throw new Error(`R2 upload failed: ${put.status}`);
}

async function parseFromKey(key: string): Promise<ParseResponse> {
  const resp = await fetch("/api/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    const detail = data?.warnings?.[0] || data?.error || `parse failed: ${resp.status}`;
    throw new Error(detail);
  }
  return data;
}

function adjustedAmount(amount: number, signConvention: SignConvention): number {
  return signConvention === "inverted" ? amount * -1 : amount;
}

function toExportRows(transactions: Transaction[], options: ExportOptions): ExportRow[] {
  return transactions.map((t) => {
    const signed = adjustedAmount(t.amount, options.signConvention);
    if (options.format === "split") {
      return {
        date: t.date,
        description: t.description,
        debit: signed < 0 ? Math.abs(signed) : undefined,
        credit: signed > 0 ? signed : undefined,
        currency: options.includeCurrency ? t.currency ?? "" : undefined,
        balance: t.balance,
      };
    }

    return {
      date: t.date,
      description: t.description,
      amount: signed,
      currency: options.includeCurrency ? t.currency ?? "" : undefined,
      balance: t.balance,
    };
  });
}

function toCsv(transactions: Transaction[], options: ExportOptions): string {
  const rows = toExportRows(transactions, options);
  const headers = ["date", "description"];
  if (options.format === "split") {
    headers.push("debit", "credit");
  } else {
    headers.push("amount");
  }
  if (options.includeCurrency) headers.push("currency");
  headers.push("balance");

  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const body = rows.map((row) => {
    const values: unknown[] = [row.date, row.description];
    if (options.format === "split") {
      values.push(row.debit ?? "", row.credit ?? "");
    } else {
      values.push(row.amount ?? "");
    }
    if (options.includeCurrency) values.push(row.currency ?? "");
    values.push(row.balance ?? "");
    return values.map(esc).join(",");
  });

  return [headers.join(","), ...body].join("\n");
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [includeCurrency, setIncludeCurrency] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("signed");
  const [signConvention, setSignConvention] = useState<SignConvention>("native");
  const [themeName, setThemeName] = useState<ThemeName>("classic");

  const exportOptions = useMemo(
    () => ({ includeCurrency, format: exportFormat, signConvention }),
    [includeCurrency, exportFormat, signConvention]
  );

  const previewRows = useMemo(
    () => (result?.transactions?.length ? toExportRows(result.transactions, exportOptions) : []),
    [result, exportOptions]
  );

  const csv = useMemo(
    () => (result?.transactions?.length ? toCsv(result.transactions, exportOptions) : ""),
    [result, exportOptions]
  );
  const theme = THEMES[themeName];

  async function onConvert() {
    if (!file) return;
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const { uploadUrl, key } = await getUploadUrl(file);
      await uploadToR2(uploadUrl, file);
      const parsed = await parseFromKey(key);
      setResult(parsed);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function downloadCsv() {
    if (!csv) return;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ background: `linear-gradient(180deg, ${theme.pageBg} 0%, ${theme.pageBg} 70%, ${theme.panelBg} 100%)`, minHeight: "100vh", color: theme.pageFg }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px", fontFamily: theme.fontBody }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 6, marginTop: 0, fontFamily: theme.fontHeading, color: theme.heading, letterSpacing: 0.2 }}>statement2csv</h1>
          <p style={{ marginTop: 0, color: theme.muted }}>
        Upload a bank statement PDF → preview transactions → download CSV.
      </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: theme.muted, fontSize: 13 }}>Theme</span>
          {(["classic", "ledger", "signal"] as ThemeName[]).map((name) => (
            <button
              key={name}
              onClick={() => setThemeName(name)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: `1px solid ${theme.controlBorder}`,
                background: themeName === name ? theme.controlActiveBg : theme.controlBg,
                color: theme.pageFg,
                textTransform: "capitalize",
              }}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ border: `1px solid ${theme.panelBorder}`, borderRadius: 14, padding: 16, background: theme.panelBg, boxShadow: "0 8px 30px rgba(0,0,0,0.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button disabled={!file || busy} onClick={onConvert} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${theme.controlBorder}`, background: theme.controlBg, color: theme.pageFg }}>
              {busy ? "Converting…" : "Convert"}
            </button>
            <button disabled={!csv} onClick={downloadCsv} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${theme.controlBorder}`, background: theme.controlBg, color: theme.pageFg }}>
              Download CSV
            </button>
          </div>

          <div style={{ minWidth: 260, border: `1px solid ${theme.panelBorder}`, borderRadius: 10, padding: 10, background: theme.controlBg }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Export Settings</div>
            <label style={{ display: "block", fontSize: 13, marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={includeCurrency}
                onChange={(e) => setIncludeCurrency(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              Include currency column
            </label>
            <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>
              Export format:
            </label>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button
                onClick={() => setExportFormat("signed")}
                style={{
                  padding: "6px 10px",
                  border: `1px solid ${theme.controlBorder}`,
                  background: exportFormat === "signed" ? theme.controlActiveBg : theme.controlBg,
                  color: theme.pageFg,
                }}
              >
                Signed Amount
              </button>
              <button
                onClick={() => setExportFormat("split")}
                style={{
                  padding: "6px 10px",
                  border: `1px solid ${theme.controlBorder}`,
                  background: exportFormat === "split" ? theme.controlActiveBg : theme.controlBg,
                  color: theme.pageFg,
                }}
              >
                Debit/Credit
              </button>
            </div>
            <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>
              Sign convention:
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setSignConvention("native")}
                style={{
                  padding: "6px 10px",
                  border: `1px solid ${theme.controlBorder}`,
                  background: signConvention === "native" ? theme.controlActiveBg : theme.controlBg,
                  color: theme.pageFg,
                }}
              >
                Native
              </button>
              <button
                onClick={() => setSignConvention("inverted")}
                style={{
                  padding: "6px 10px",
                  border: `1px solid ${theme.controlBorder}`,
                  background: signConvention === "inverted" ? theme.controlActiveBg : theme.controlBg,
                  color: theme.pageFg,
                }}
              >
                Inverted
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, color: theme.muted, fontSize: 13 }}>
          Privacy: files are uploaded to R2 for parsing and deleted after conversion (MVP target behavior).
        </div>

        {error && (
          <div style={{ marginTop: 12, color: "#b00020" }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {result && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
              <div><strong>Transactions:</strong> {result.transactions.length}</div>
              {typeof result.confidence === "number" && <div><strong>Confidence:</strong> {(result.confidence * 100).toFixed(0)}%</div>}
            </div>

            {result.warnings?.length ? (
              <ul style={{ marginTop: 8 }}>
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            ) : null}

            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: theme.tableHeaderBg }}>
                    <th style={{ textAlign: "left", borderBottom: `1px solid ${theme.tableRowBorder}`, padding: "8px" }}>Date</th>
                    <th style={{ textAlign: "left", borderBottom: `1px solid ${theme.tableRowBorder}`, padding: "8px" }}>Description</th>
                    {exportFormat === "split" ? (
                      <>
                        <th style={{ textAlign: "right", borderBottom: `1px solid ${theme.tableRowBorder}`, padding: "8px" }}>Debit</th>
                        <th style={{ textAlign: "right", borderBottom: `1px solid ${theme.tableRowBorder}`, padding: "8px" }}>Credit</th>
                      </>
                    ) : (
                      <th style={{ textAlign: "right", borderBottom: `1px solid ${theme.tableRowBorder}`, padding: "8px" }}>Amount</th>
                    )}
                    {includeCurrency ? (
                      <th style={{ textAlign: "left", borderBottom: `1px solid ${theme.tableRowBorder}`, padding: "8px" }}>Currency</th>
                    ) : null}
                    <th style={{ textAlign: "right", borderBottom: `1px solid ${theme.tableRowBorder}`, padding: "8px" }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 50).map((t, idx) => (
                    <tr key={idx} style={{ background: idx % 2 ? theme.tableRowAlt : "transparent" }}>
                      <td style={{ borderBottom: `1px solid ${theme.tableRowBorder}`, padding: "8px", whiteSpace: "nowrap" }}>{t.date}</td>
                      <td style={{ borderBottom: `1px solid ${theme.tableRowBorder}`, padding: "8px" }}>{t.description}</td>
                      {exportFormat === "split" ? (
                        <>
                          <td style={{ borderBottom: `1px solid ${theme.tableRowBorder}`, padding: "8px", textAlign: "right", color: theme.accent, fontVariantNumeric: "tabular-nums" }}>
                            {t.debit != null ? t.debit.toFixed(2) : ""}
                          </td>
                          <td style={{ borderBottom: `1px solid ${theme.tableRowBorder}`, padding: "8px", textAlign: "right", color: theme.accent, fontVariantNumeric: "tabular-nums" }}>
                            {t.credit != null ? t.credit.toFixed(2) : ""}
                          </td>
                        </>
                      ) : (
                        <td style={{ borderBottom: `1px solid ${theme.tableRowBorder}`, padding: "8px", textAlign: "right", color: theme.accent, fontVariantNumeric: "tabular-nums" }}>
                          {t.amount != null ? t.amount.toFixed(2) : ""}
                        </td>
                      )}
                      {includeCurrency ? (
                        <td style={{ borderBottom: `1px solid ${theme.tableRowBorder}`, padding: "8px" }}>{t.currency ?? ""}</td>
                      ) : null}
                      <td style={{ borderBottom: `1px solid ${theme.tableRowBorder}`, padding: "8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{t.balance != null ? t.balance.toFixed(2) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.transactions.length > 50 && (
                <div style={{ marginTop: 8, color: theme.muted, fontSize: 13 }}>
                  Showing first 50 rows.
                </div>
              )}
            </div>

            {result.debug && (
              <details style={{ marginTop: 12 }}>
                <summary>Debug</summary>
                <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(result.debug, null, 2)}</pre>
              </details>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: 18, color: "#666", fontSize: 13 }}>
        Text-PDF parsing is enabled for MVP. OCR fallback for scanned PDFs is planned next (see /docs).
      </div>
      </div>
    </div>
  );
}
