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
    <div style={{ maxWidth: 980, margin: "24px auto", padding: "0 16px", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }}>
      <h1 style={{ marginBottom: 6 }}>statement2csv</h1>
      <p style={{ marginTop: 0, color: "#555" }}>
        Upload a bank statement PDF → preview transactions → download CSV.
      </p>

      <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button disabled={!file || busy} onClick={onConvert} style={{ padding: "8px 12px" }}>
              {busy ? "Converting…" : "Convert"}
            </button>
            <button disabled={!csv} onClick={downloadCsv} style={{ padding: "8px 12px" }}>
              Download CSV
            </button>
          </div>

          <div style={{ minWidth: 260, border: "1px solid #e5e5e5", borderRadius: 8, padding: 10 }}>
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
                  border: "1px solid #ccc",
                  background: exportFormat === "signed" ? "#f0f0f0" : "#fff",
                }}
              >
                Signed Amount
              </button>
              <button
                onClick={() => setExportFormat("split")}
                style={{
                  padding: "6px 10px",
                  border: "1px solid #ccc",
                  background: exportFormat === "split" ? "#f0f0f0" : "#fff",
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
                  border: "1px solid #ccc",
                  background: signConvention === "native" ? "#f0f0f0" : "#fff",
                }}
              >
                Native
              </button>
              <button
                onClick={() => setSignConvention("inverted")}
                style={{
                  padding: "6px 10px",
                  border: "1px solid #ccc",
                  background: signConvention === "inverted" ? "#f0f0f0" : "#fff",
                }}
              >
                Inverted
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, color: "#666", fontSize: 13 }}>
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
                  <tr>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Date</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Description</th>
                    {exportFormat === "split" ? (
                      <>
                        <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "8px" }}>Debit</th>
                        <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "8px" }}>Credit</th>
                      </>
                    ) : (
                      <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "8px" }}>Amount</th>
                    )}
                    {includeCurrency ? (
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Currency</th>
                    ) : null}
                    <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "8px" }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 50).map((t, idx) => (
                    <tr key={idx}>
                      <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px", whiteSpace: "nowrap" }}>{t.date}</td>
                      <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px" }}>{t.description}</td>
                      {exportFormat === "split" ? (
                        <>
                          <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px", textAlign: "right" }}>
                            {t.debit != null ? t.debit.toFixed(2) : ""}
                          </td>
                          <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px", textAlign: "right" }}>
                            {t.credit != null ? t.credit.toFixed(2) : ""}
                          </td>
                        </>
                      ) : (
                        <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px", textAlign: "right" }}>
                          {t.amount != null ? t.amount.toFixed(2) : ""}
                        </td>
                      )}
                      {includeCurrency ? (
                        <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px" }}>{t.currency ?? ""}</td>
                      ) : null}
                      <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px", textAlign: "right" }}>{t.balance != null ? t.balance.toFixed(2) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.transactions.length > 50 && (
                <div style={{ marginTop: 8, color: "#666", fontSize: 13 }}>
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
  );
}
