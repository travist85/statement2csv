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

type ThemeName = "terminal-ledger" | "financial-desk";
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
  sectionRadius: number;
  tableFont: string;
};

const THEMES: Record<ThemeName, Theme> = {
  "terminal-ledger": {
    pageBg: "#070b11",
    pageFg: "#c8f8d7",
    panelBg: "#0a1118",
    panelBorder: "#1f3a2d",
    muted: "#7dc59a",
    accent: "#34f5a4",
    heading: "#d4ffe6",
    tableHeaderBg: "#0b161e",
    tableRowBorder: "#1e3a31",
    tableRowAlt: "#09131a",
    controlBg: "#0c1821",
    controlActiveBg: "#123329",
    controlBorder: "#2a5b48",
    fontBody: "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif",
    fontHeading: "'IBM Plex Mono', Consolas, monospace",
    sectionRadius: 0,
    tableFont: "'IBM Plex Mono', Consolas, monospace",
  },
  "financial-desk": {
    pageBg: "#f4f0e7",
    pageFg: "#1f1b16",
    panelBg: "#fcfaf5",
    panelBorder: "#cfc3b1",
    muted: "#675f53",
    accent: "#7f4f24",
    heading: "#2d2114",
    tableHeaderBg: "#efe5d6",
    tableRowBorder: "#d6cab8",
    tableRowAlt: "#faf6ef",
    controlBg: "#f8f3ea",
    controlActiveBg: "#efe3d1",
    controlBorder: "#c6b8a4",
    fontBody: "'Source Sans 3', 'Segoe UI', system-ui, sans-serif",
    fontHeading: "'Fraunces', Georgia, serif",
    sectionRadius: 2,
    tableFont: "'Source Sans 3', 'Segoe UI', system-ui, sans-serif",
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
  const [themeName, setThemeName] = useState<ThemeName>("financial-desk");

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
  const isTerminal = themeName === "terminal-ledger";

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
    <div style={{ background: `linear-gradient(180deg, ${theme.pageBg} 0%, ${theme.pageBg} 65%, ${theme.panelBg} 100%)`, minHeight: "100vh", color: theme.pageFg }}>
      <div style={{ maxWidth: isTerminal ? 1240 : 1100, margin: "0 auto", padding: "22px 16px", fontFamily: theme.fontBody }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isTerminal ? "stretch" : "center", gap: 12, flexWrap: "wrap", border: isTerminal ? `1px solid ${theme.panelBorder}` : "none", padding: isTerminal ? 12 : 0, background: isTerminal ? theme.panelBg : "transparent" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h1 style={{ marginBottom: 0, marginTop: 0, fontFamily: theme.fontHeading, color: theme.heading, letterSpacing: isTerminal ? 1.2 : 0.2, textTransform: isTerminal ? "uppercase" : "none", fontSize: isTerminal ? 30 : 46 }}>statement2csv</h1>
            <span
              style={{
                fontSize: 11,
                letterSpacing: 0.8,
                textTransform: "uppercase",
                border: `1px solid ${theme.controlBorder}`,
                background: theme.controlBg,
                color: theme.muted,
                padding: "2px 6px",
                borderRadius: theme.sectionRadius,
              }}
            >
              Public Beta
            </span>
          </div>
          <p style={{ marginTop: 0, marginBottom: 0, color: theme.muted, fontFamily: isTerminal ? theme.tableFont : theme.fontBody }}>
        Upload your statement, review transactions, export CSV.
      </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, borderLeft: isTerminal ? `1px solid ${theme.panelBorder}` : "none", paddingLeft: isTerminal ? 12 : 0 }}>
          <span style={{ color: theme.muted, fontSize: 13, textTransform: isTerminal ? "uppercase" : "none", letterSpacing: isTerminal ? 0.8 : 0 }}>Style</span>
          {(["financial-desk", "terminal-ledger"] as ThemeName[]).map((name) => (
            <button
              key={name}
              onClick={() => setThemeName(name)}
              style={{
                padding: "6px 10px",
                borderRadius: theme.sectionRadius,
                border: `1px solid ${theme.controlBorder}`,
                background: themeName === name ? theme.controlActiveBg : theme.controlBg,
                color: theme.pageFg,
                textTransform: "capitalize",
                fontFamily: isTerminal ? theme.tableFont : theme.fontBody,
              }}
            >
              {name === "terminal-ledger" ? "Terminal" : "Classic"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 14, border: `1px solid ${theme.panelBorder}`, borderRadius: theme.sectionRadius, padding: 16, background: theme.panelBg, boxShadow: isTerminal ? "none" : "0 8px 30px rgba(30,20,10,0.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button disabled={!file || busy} onClick={onConvert} style={{ padding: "8px 12px", borderRadius: theme.sectionRadius, border: `1px solid ${theme.controlBorder}`, background: theme.controlBg, color: theme.pageFg, fontFamily: isTerminal ? theme.tableFont : theme.fontBody }}>
              {busy ? "Converting…" : "Convert"}
            </button>
            <button disabled={!csv} onClick={downloadCsv} style={{ padding: "8px 12px", borderRadius: theme.sectionRadius, border: `1px solid ${theme.controlBorder}`, background: theme.controlBg, color: theme.pageFg, fontFamily: isTerminal ? theme.tableFont : theme.fontBody }}>
              Download CSV
            </button>
          </div>

          <div style={{ minWidth: 260, border: `1px solid ${theme.panelBorder}`, borderRadius: theme.sectionRadius, padding: 10, background: theme.controlBg }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, textTransform: isTerminal ? "uppercase" : "none", letterSpacing: isTerminal ? 0.8 : 0 }}>Export Settings</div>
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
                  borderRadius: theme.sectionRadius,
                }}
              >
                Single Amount
              </button>
              <button
                onClick={() => setExportFormat("split")}
                style={{
                  padding: "6px 10px",
                  border: `1px solid ${theme.controlBorder}`,
                  background: exportFormat === "split" ? theme.controlActiveBg : theme.controlBg,
                  color: theme.pageFg,
                  borderRadius: theme.sectionRadius,
                }}
              >
                Debit/Credit
              </button>
            </div>
            <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>
              Amount signs:
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setSignConvention("native")}
                style={{
                  padding: "6px 10px",
                  border: `1px solid ${theme.controlBorder}`,
                  background: signConvention === "native" ? theme.controlActiveBg : theme.controlBg,
                  color: theme.pageFg,
                  borderRadius: theme.sectionRadius,
                }}
              >
                As Statement
              </button>
              <button
                onClick={() => setSignConvention("inverted")}
                style={{
                  padding: "6px 10px",
                  border: `1px solid ${theme.controlBorder}`,
                  background: signConvention === "inverted" ? theme.controlActiveBg : theme.controlBg,
                  color: theme.pageFg,
                  borderRadius: theme.sectionRadius,
                }}
              >
                Flip +/-
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, color: theme.muted, fontSize: 13 }}>
          Privacy: Files are deleted after conversion and never used for any other purpose.
        </div>

        {error && (
          <div style={{ marginTop: 12, color: "#b00020" }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {result && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "baseline", borderBottom: `1px solid ${theme.tableRowBorder}`, paddingBottom: 6, marginBottom: 6 }}>
              <div><strong>Transactions:</strong> {result.transactions.length}</div>
              {typeof result.confidence === "number" && <div><strong>Confidence:</strong> {(result.confidence * 100).toFixed(0)}%</div>}
              <div><strong>Flags:</strong> {result.warnings?.length ?? 0}</div>
            </div>

            {result.warnings?.length ? (
              <ul style={{ marginTop: 8 }}>
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            ) : null}

            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: theme.tableFont }}>
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

      <div style={{ marginTop: 18, color: theme.muted, fontSize: 13, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span>Text-based PDFs are supported. OCR for scanned statements is coming next.</span>
        <span style={{ display: "flex", gap: 14 }}>
          <a
            href="https://github.com/travist85/statement2csv/issues"
            target="_blank"
            rel="noreferrer"
            style={{ color: theme.accent }}
          >
            Report an issue
          </a>
        </span>
      </div>

      <section style={{ marginTop: 26, borderTop: `1px solid ${theme.panelBorder}`, paddingTop: 18 }}>
        <h2 style={{ margin: 0, fontFamily: theme.fontHeading, color: theme.heading, fontSize: 24 }}>
          Bank Statement PDF to CSV Converter
        </h2>
        <p style={{ marginTop: 8, color: theme.muted }}>
          statement2csv helps convert bank statement PDFs into CSV transactions you can review and export quickly.
        </p>
        <h3 style={{ marginTop: 18, marginBottom: 8, fontFamily: theme.fontHeading, color: theme.heading, fontSize: 18 }}>
          Common use cases
        </h3>
        <ul style={{ marginTop: 0, color: theme.muted }}>
          <li>Convert statement PDFs when direct bank CSV export is missing or inconsistent.</li>
          <li>Prepare transaction rows for spreadsheet cleanup and accounting import.</li>
          <li>Standardize statement data from multiple institutions into one CSV format.</li>
        </ul>
        <h3 style={{ marginTop: 18, marginBottom: 8, fontFamily: theme.fontHeading, color: theme.heading, fontSize: 18 }}>
          FAQ
        </h3>
        <p style={{ marginBottom: 6 }}><strong>Can I convert a bank statement PDF to CSV?</strong></p>
        <p style={{ marginTop: 0, color: theme.muted }}>Yes. Upload your statement, review transactions, and export CSV.</p>
        <p style={{ marginBottom: 6 }}><strong>Is my statement data retained?</strong></p>
        <p style={{ marginTop: 0, color: theme.muted }}>No. Files are deleted after conversion and not used for any other purpose.</p>
        <p style={{ marginBottom: 6 }}><strong>Do scanned statements work?</strong></p>
        <p style={{ marginTop: 0, color: theme.muted }}>Text-based PDFs are supported now. OCR support is planned next.</p>
      </section>
      </div>
    </div>
  );
}
