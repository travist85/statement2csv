import { useEffect, useMemo, useRef, useState } from "react";

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

type ThemeName = "terminal" | "classic";
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
  terminal: {
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
  classic: {
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

type AnalyticsEventName =
  | "page_view"
  | "convert_clicked"
  | "convert_success"
  | "convert_error"
  | "download_csv"
  | "download_xlsx"
  | "report_issue_clicked";

function trackEvent(
  name: AnalyticsEventName,
  clientId: string,
  sessionId: string,
  meta?: Record<string, unknown>
): void {
  const payload = {
    event: name,
    clientId,
    sessionId,
    path: window.location.pathname,
    ts: new Date().toISOString(),
    meta,
  };

  void fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Non-blocking analytics; ignore delivery failures.
  });
}

function randomId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function getOrCreateClientId(): string {
  const key = "banksheet_client_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = randomId("c");
  localStorage.setItem(key, created);
  return created;
}

function getOrCreateSessionId(): string {
  const key = "banksheet_session_id";
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const created = randomId("s");
  sessionStorage.setItem(key, created);
  return created;
}

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

function spinnerStyle(theme: Theme) {
  return {
    width: 14,
    height: 14,
    borderRadius: "50%",
    border: `2px solid ${theme.controlBorder}`,
    borderTopColor: theme.accent,
    display: "inline-block",
    animation: "banksheet-spin 0.8s linear infinite",
  } as const;
}

async function toXlsx(transactions: Transaction[], options: ExportOptions): Promise<Blob> {
  const XLSX = await import("xlsx");
  const rows = toExportRows(transactions, options);
  const data = rows.map((row) => {
    const base: Record<string, string | number> = {
      Date: row.date,
      Description: row.description,
    };

    if (options.format === "split") {
      base.Debit = row.debit ?? "";
      base.Credit = row.credit ?? "";
    } else {
      base.Amount = row.amount ?? "";
    }

    if (options.includeCurrency) {
      base.Currency = row.currency ?? "";
    }

    base.Balance = row.balance ?? "";
    return base;
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export default function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [includeCurrency] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("signed");
  const [signConvention, setSignConvention] = useState<SignConvention>("native");
  const [themeName] = useState<ThemeName>("classic");

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
  const showDebug = useMemo(() => new URLSearchParams(window.location.search).get("debug") === "1", []);
  const theme = THEMES[themeName];
  const isTerminal = themeName === "terminal";
  const hasTransactions = Boolean(result?.transactions?.length);
  const canConvert = Boolean(file) && !busy;
  const canExport = hasTransactions;
  const analyticsContext = useMemo(
    () => ({
      clientId: getOrCreateClientId(),
      sessionId: getOrCreateSessionId(),
    }),
    []
  );

  function emitEvent(name: AnalyticsEventName, meta?: Record<string, unknown>) {
    trackEvent(name, analyticsContext.clientId, analyticsContext.sessionId, meta);
  }

  const currentStep: "select" | "convert" | "export" = !file
    ? "select"
    : hasTransactions
      ? "export"
      : "convert";

  useEffect(() => {
    if (window.location.hostname === "www.banksheet.co") {
      const target = `https://banksheet.co${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.replace(target);
      return;
    }
    emitEvent("page_view");
  }, []);

  function pickFile(nextFile: File | null) {
    if (!nextFile) return;
    const isPdf = nextFile.type === "application/pdf" || nextFile.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setError("Please select a PDF file.");
      return;
    }
    setError(null);
    setResult(null);
    setFile(nextFile);
  }

  function actionButtonStyle(disabled: boolean, size: "default" | "large" = "default") {
    return {
      padding: size === "large" ? "10px 16px" : "8px 12px",
      borderRadius: theme.sectionRadius,
      border: `1px solid ${disabled ? theme.controlBorder : theme.accent}`,
      background: disabled ? theme.controlBg : theme.controlActiveBg,
      color: theme.pageFg,
      fontFamily: isTerminal ? theme.tableFont : theme.fontBody,
      fontSize: size === "large" ? 14 : 13,
      fontWeight: size === "large" ? 600 : 500,
      opacity: disabled ? 0.45 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
    } as const;
  }

  function convertButtonStyle(disabled: boolean) {
    return {
      ...actionButtonStyle(disabled, "large"),
    } as const;
  }

  async function onConvert() {
    if (!file) return;
    emitEvent("convert_clicked", { file_name_ext: file.name.split(".").pop()?.toLowerCase() ?? "unknown" });
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const { uploadUrl, key } = await getUploadUrl(file);
      await uploadToR2(uploadUrl, file);
      const parsed = await parseFromKey(key);
      setResult(parsed);
      emitEvent("convert_success", {
        transactions: parsed.transactions.length,
        confidence: parsed.confidence ?? null,
        warnings: parsed.warnings?.length ?? 0,
      });
    } catch (e: any) {
      setError(e?.message ?? String(e));
      emitEvent("convert_error");
    } finally {
      setBusy(false);
    }
  }

  function downloadCsv() {
    if (!csv) return;
    emitEvent("download_csv", { rows: result?.transactions?.length ?? 0 });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadXlsx() {
    if (!result?.transactions?.length) return;
    emitEvent("download_xlsx", { rows: result.transactions.length });
    const blob = await toXlsx(result.transactions, exportOptions);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transactions.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ background: `linear-gradient(180deg, ${theme.pageBg} 0%, ${theme.pageBg} 65%, ${theme.panelBg} 100%)`, minHeight: "100vh", color: theme.pageFg }}>
      <style>{`@keyframes banksheet-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div style={{ maxWidth: isTerminal ? 1240 : 1100, margin: "0 auto", padding: "22px 16px", fontFamily: theme.fontBody }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isTerminal ? "stretch" : "center", gap: 12, flexWrap: "wrap", border: isTerminal ? `1px solid ${theme.panelBorder}` : "none", padding: isTerminal ? 12 : 0, background: isTerminal ? theme.panelBg : "transparent" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h1 style={{ marginBottom: 0, marginTop: 0, fontFamily: theme.fontHeading, color: theme.heading, letterSpacing: isTerminal ? 1.2 : 0.2, textTransform: isTerminal ? "uppercase" : "none", fontSize: isTerminal ? 30 : 46 }}>BankSheet</h1>
          </div>
          <p style={{ marginTop: 0, marginBottom: 0, color: theme.muted, fontFamily: isTerminal ? theme.tableFont : theme.fontBody }}>
        Upload your statement, review transactions, export CSV or XLSX.
      </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, borderLeft: isTerminal ? `1px solid ${theme.panelBorder}` : "none", paddingLeft: isTerminal ? 12 : 0 }}>
          <a
            href="https://github.com/travist85/statement2csv/issues"
            target="_blank"
            rel="noreferrer"
            onClick={() => emitEvent("report_issue_clicked")}
            style={{ color: theme.accent, fontSize: 14 }}
          >
            Report an issue
          </a>
        </div>
      </div>

      <div style={{ marginTop: 14, border: `1px solid ${theme.panelBorder}`, borderRadius: theme.sectionRadius, padding: 16, background: theme.panelBg, boxShadow: isTerminal ? "none" : "0 8px 30px rgba(30,20,10,0.08)", boxSizing: "border-box", overflow: "hidden" }}>
        <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
          <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
              aria-hidden="true"
              tabIndex={-1}
            />
            <div style={{ width: "100%", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 14 }}>
              {[
                { label: "1. Select PDF", id: "select" as const },
                { label: "2. Convert", id: "convert" as const },
                { label: "3. Export", id: "export" as const },
              ].map((step) => (
                <span
                  key={step.label}
                  style={{
                    color: theme.pageFg,
                    fontWeight: step.id === currentStep ? 700 : 500,
                  }}
                >
                  {step.label}
                </span>
              ))}
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingFile(false);
                pickFile(e.dataTransfer.files?.[0] ?? null);
              }}
              style={{
                position: "relative",
                width: "100%",
                minWidth: 0,
                maxWidth: "100%",
                minHeight: 150,
                padding: "18px 16px 70px",
                boxSizing: "border-box",
                borderRadius: theme.sectionRadius,
                border: `1px dashed ${isDraggingFile ? theme.accent : theme.controlBorder}`,
                background: isDraggingFile ? theme.controlActiveBg : theme.controlBg,
                color: file ? theme.pageFg : theme.muted,
                fontFamily: isTerminal ? theme.tableFont : theme.fontBody,
                fontSize: 14,
                cursor: "pointer",
                userSelect: "none",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                textAlign: "center",
              }}
              title={file ? file.name : "Drop PDF here or click to select"}
            >
              <div style={{ fontSize: 15, lineHeight: 1.35, fontWeight: 500, color: file ? theme.pageFg : theme.muted }}>
                {file ? "PDF selected:" : "Drop bank statement PDF here or click to select"}
              </div>
              {file ? (
                <div style={{ marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", fontWeight: 700 }}>
                  {file.name}
                </div>
              ) : null}
              <button
                disabled={!canConvert}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (canConvert) void onConvert();
                }}
                style={{
                  ...convertButtonStyle(!canConvert),
                  position: "absolute",
                  left: "50%",
                  transform: "translateX(-50%)",
                  bottom: 26,
                }}
              >
                {busy ? "Reading…" : "Extract transactions"}
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "end", gap: 16, minWidth: 0 }}>
            <div style={{ maxWidth: 400, width: "100%", border: `1px solid ${theme.panelBorder}`, borderRadius: theme.sectionRadius, padding: 10, background: theme.controlBg, boxSizing: "border-box", minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, textTransform: isTerminal ? "uppercase" : "none", letterSpacing: isTerminal ? 0.8 : 0 }}>Export Settings</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <label style={{ fontSize: 13 }}>
                    Amount columns:
                  </label>
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
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <label style={{ fontSize: 13 }}>
                  Amount signs:
                </label>
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
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button disabled={!canExport} onClick={downloadCsv} style={actionButtonStyle(!canExport, "large")}>
                  Download CSV
                </button>
                <button disabled={!canExport} onClick={downloadXlsx} style={actionButtonStyle(!canExport, "large")}>
                  Download XLSX
                </button>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 12, color: "#b00020" }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {busy && (
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: theme.muted, fontSize: 14, textAlign: "center" }}>
            <span style={spinnerStyle(theme)} aria-hidden="true" />
            <span>PDF selected. Reading transactions...</span>
          </div>
        )}

        {result && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", borderBottom: `1px solid ${theme.tableRowBorder}`, paddingBottom: 8, marginBottom: 6 }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                <div><strong>Transactions:</strong> {result.transactions.length}</div>
                {typeof result.confidence === "number" && <div><strong>Confidence:</strong> {(result.confidence * 100).toFixed(0)}%</div>}
                <div><strong>Warnings:</strong> {result.warnings?.length ?? 0}</div>
              </div>
            </div>

            {result.warnings?.length ? (
              <ul style={{ marginTop: 8 }}>
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            ) : null}

            <div style={{ marginTop: 12, overflowX: "auto", maxWidth: "100%", width: "100%" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: theme.tableFont, tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: 110 }} />
                  <col />
                  {exportFormat === "split" ? (
                    <>
                      <col style={{ width: 90 }} />
                      <col style={{ width: 90 }} />
                    </>
                  ) : (
                    <col style={{ width: 110 }} />
                  )}
                  {includeCurrency ? <col style={{ width: 90 }} /> : null}
                  <col style={{ width: 110 }} />
                </colgroup>
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
                      <td style={{ borderBottom: `1px solid ${theme.tableRowBorder}`, padding: "8px", whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word" }}>{t.description}</td>
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

            {showDebug && result.debug && (
              <details style={{ marginTop: 12 }}>
                <summary>Debug</summary>
                <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(result.debug, null, 2)}</pre>
              </details>
            )}
          </div>
        )}
      </div>

      <footer
        style={{
          marginTop: 18,
          paddingTop: 12,
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          color: theme.muted,
          fontSize: 12,
        }}
      >
        <span>BankSheet v0.1.0 (Public Beta)</span>
        <span>Statement files and transaction data are deleted after conversion.</span>
      </footer>

      </div>
    </div>
  );
}
