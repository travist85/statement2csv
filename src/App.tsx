import { useEffect, useMemo, useRef, useState } from "react";

type Transaction = {
  date: string; // ISO YYYY-MM-DD (normalized)
  description: string;
  amount: number; // signed (debit negative, credit positive)
  currency?: string;
  balance?: number;
  sourceFile?: string;
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
type ExportTarget = "generic" | "xero" | "quickbooks" | "myob";
type ExportOptions = {
  includeCurrency: boolean;
  format: ExportFormat;
  signConvention: SignConvention;
  target: ExportTarget;
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

type BatchItemResult = {
  fileName: string;
  status: "success" | "error";
  count: number;
  confidence?: number;
  error?: string;
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
  | "contact_clicked";

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

async function uploadToR2(uploadUrl: string, key: string, file: File): Promise<void> {
  try {
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/pdf" },
      body: file,
    });
    if (!put.ok) throw new Error(`R2 upload failed: ${put.status}`);
    return;
  } catch {
    // Some browsers/extensions/network policies can block cross-origin presigned PUTs.
    // Fall back to same-origin proxy upload to keep conversion working.
  }

  const url = new URL("/api/upload-proxy", window.location.origin);
  url.searchParams.set("key", key);
  url.searchParams.set("contentType", file.type || "application/pdf");

  const proxy = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": file.type || "application/pdf" },
    body: file,
  });
  if (!proxy.ok) throw new Error(`upload proxy failed: ${proxy.status}`);
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

function rowSignedAmount(row: ExportRow): number {
  if (typeof row.amount === "number") return row.amount;
  return (row.credit ?? 0) - (row.debit ?? 0);
}

function targetHeaders(options: ExportOptions): string[] {
  if (options.target === "xero") return ["Date", "Amount", "Payee", "Description", "Reference"];
  if (options.target === "quickbooks") return ["Date", "Description", "Debit", "Credit", "Balance"];
  if (options.target === "myob") return ["Date", "Description", "Amount", "Memo", "Balance"];

  const headers = ["Date", "Description"];
  if (options.format === "split") headers.push("Debit", "Credit");
  else headers.push("Amount");
  headers.push("Balance");
  return headers;
}

function toTargetRecords(transactions: Transaction[], options: ExportOptions): Record<string, string | number>[] {
  const rows = toExportRows(transactions, options);
  if (options.target === "xero") {
    return rows.map((row) => ({
      Date: row.date,
      Amount: rowSignedAmount(row),
      Payee: row.description.slice(0, 80),
      Description: row.description,
      Reference: "",
    }));
  }
  if (options.target === "quickbooks") {
    return rows.map((row) => ({
      Date: row.date,
      Description: row.description,
      Debit: row.debit ?? (rowSignedAmount(row) < 0 ? Math.abs(rowSignedAmount(row)) : ""),
      Credit: row.credit ?? (rowSignedAmount(row) > 0 ? rowSignedAmount(row) : ""),
      Balance: row.balance ?? "",
    }));
  }
  if (options.target === "myob") {
    return rows.map((row) => ({
      Date: row.date,
      Description: row.description,
      Amount: rowSignedAmount(row),
      Memo: "",
      Balance: row.balance ?? "",
    }));
  }

  return rows.map((row) => {
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
    base.Balance = row.balance ?? "";
    return base;
  });
}

function toCsv(transactions: Transaction[], options: ExportOptions): string {
  const records = toTargetRecords(transactions, options);
  const headers = targetHeaders(options);

  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const body = records.map((row) => headers.map((h) => esc(row[h] ?? "")).join(","));

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
  const data = toTargetRecords(transactions, options);

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
  const [files, setFiles] = useState<File[]>([]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [batchResults, setBatchResults] = useState<BatchItemResult[]>([]);
  const [includeCurrency] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("signed");
  const [signConvention, setSignConvention] = useState<SignConvention>("native");
  const [exportTarget, setExportTarget] = useState<ExportTarget>("generic");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "amount_desc" | "amount_asc">("date_desc");
  const [themeName] = useState<ThemeName>("classic");

  const exportOptions = useMemo(
    () => ({ includeCurrency, format: exportFormat, signConvention, target: exportTarget }),
    [includeCurrency, exportFormat, signConvention, exportTarget]
  );

  const preparedTransactions = useMemo(() => {
    const source = result?.transactions ?? [];
    const needle = searchTerm.trim().toLowerCase();
    let filtered = needle
      ? source.filter((t) =>
          `${t.date} ${t.description} ${t.sourceFile ?? ""}`.toLowerCase().includes(needle)
        )
      : source;

    filtered = [...filtered].sort((a, b) => {
      if (sortBy === "date_asc") return a.date.localeCompare(b.date);
      if (sortBy === "date_desc") return b.date.localeCompare(a.date);
      if (sortBy === "amount_asc") return a.amount - b.amount;
      return b.amount - a.amount;
    });
    return filtered;
  }, [result, searchTerm, sortBy]);

  const previewRows = useMemo(
    () => (preparedTransactions.length ? toExportRows(preparedTransactions, exportOptions) : []),
    [preparedTransactions, exportOptions]
  );

  const csv = useMemo(
    () => (preparedTransactions.length ? toCsv(preparedTransactions, exportOptions) : ""),
    [preparedTransactions, exportOptions]
  );
  const showDebug = useMemo(() => new URLSearchParams(window.location.search).get("debug") === "1", []);
  const theme = THEMES[themeName];
  const isTerminal = themeName === "terminal";
  const hasTransactions = Boolean(result?.transactions?.length);
  const canConvert = files.length > 0 && !busy;
  const canExport = hasTransactions;
  const showSourceColumn = batchResults.filter((b) => b.status === "success").length > 1;
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

  const currentStep: "select" | "convert" | "export" = files.length === 0
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

  function pickFiles(nextFiles: File[] | null) {
    if (!nextFiles?.length) return;
    const valid = nextFiles.filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );
    if (!valid.length) {
      setError("Please select PDF files.");
      return;
    }
    setError(null);
    setResult(null);
    setBatchResults([]);
    setFiles(valid);
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
    if (!files.length) return;
    emitEvent("convert_clicked", { files: files.length });
    setError(null);
    setResult(null);
    setBatchResults([]);
    setBusy(true);
    try {
      const allTransactions: Transaction[] = [];
      const allWarnings: string[] = [];
      const fileOutcomes: BatchItemResult[] = [];
      const confidences: number[] = [];

      for (const file of files) {
        try {
          const { uploadUrl, key } = await getUploadUrl(file);
          await uploadToR2(uploadUrl, key, file);
          const parsed = await parseFromKey(key);
          allTransactions.push(
            ...parsed.transactions.map((t) => ({
              ...t,
              sourceFile: file.name,
            }))
          );
          if (parsed.warnings?.length) {
            allWarnings.push(...parsed.warnings.map((w) => `${file.name}: ${w}`));
          }
          if (typeof parsed.confidence === "number") confidences.push(parsed.confidence);
          fileOutcomes.push({
            fileName: file.name,
            status: "success",
            count: parsed.transactions.length,
            confidence: parsed.confidence,
          });
        } catch (e: any) {
          fileOutcomes.push({
            fileName: file.name,
            status: "error",
            count: 0,
            error: e?.message ?? "Conversion failed",
          });
          allWarnings.push(`${file.name}: ${e?.message ?? "Conversion failed"}`);
        }
      }

      setBatchResults(fileOutcomes);
      const successful = fileOutcomes.filter((o) => o.status === "success").length;
      if (!successful) throw new Error("No files converted successfully.");

      setResult({
        ok: true,
        transactions: allTransactions,
        warnings: allWarnings,
        confidence: confidences.length
          ? confidences.reduce((a, b) => a + b, 0) / confidences.length
          : 0,
      });
      emitEvent("convert_success", {
        files: files.length,
        successfulFiles: successful,
        transactions: allTransactions.length,
        warnings: allWarnings.length,
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
    emitEvent("download_csv", { rows: preparedTransactions.length, target: exportTarget });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${exportTarget}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadXlsx() {
    if (!preparedTransactions.length) return;
    emitEvent("download_xlsx", { rows: preparedTransactions.length, target: exportTarget });
    const blob = await toXlsx(preparedTransactions, exportOptions);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${exportTarget}.xlsx`;
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
            onClick={() => emitEvent("contact_clicked")}
            style={{ color: theme.accent, fontSize: 14 }}
          >
            Contact
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
              multiple
              onChange={(e) => pickFiles(Array.from(e.target.files ?? []))}
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
                pickFiles(Array.from(e.dataTransfer.files ?? []));
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
                color: files.length ? theme.pageFg : theme.muted,
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
              title={files.length ? (files.length === 1 ? files[0].name : `${files.length} files selected`) : "Drop PDF here or click to select"}
            >
              <div style={{ fontSize: 15, lineHeight: 1.35, fontWeight: 500, color: files.length ? theme.pageFg : theme.muted }}>
                {files.length ? "PDF file(s) selected:" : "Drop bank statement PDF files here or click to select"}
              </div>
              {files.length ? (
                <div style={{ marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", fontWeight: 700 }}>
                  {files.length === 1 ? files[0].name : `${files.length} files selected`}
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
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <label style={{ fontSize: 13 }}>Export target:</label>
                {([
                  { id: "generic", label: "Generic" },
                  { id: "xero", label: "Xero" },
                  { id: "quickbooks", label: "QuickBooks" },
                  { id: "myob", label: "MYOB" },
                ] as { id: ExportTarget; label: string }[]).map((target) => (
                  <button
                    key={target.id}
                    onClick={() => setExportTarget(target.id)}
                    style={{
                      padding: "6px 10px",
                      border: `1px solid ${theme.controlBorder}`,
                      background: exportTarget === target.id ? theme.controlActiveBg : theme.controlBg,
                      color: theme.pageFg,
                      borderRadius: theme.sectionRadius,
                    }}
                  >
                    {target.label}
                  </button>
                ))}
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

        {batchResults.length > 0 && (
          <div style={{ marginTop: 12, border: `1px solid ${theme.panelBorder}`, padding: 10, background: theme.controlBg }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Batch results</div>
            <div style={{ display: "grid", gap: 4 }}>
              {batchResults.map((item, idx) => (
                <div key={`${item.fileName}-${idx}`} style={{ fontSize: 13, color: item.status === "error" ? "#b00020" : theme.pageFg }}>
                  {item.fileName}: {item.status === "success" ? `${item.count} transactions` : `failed (${item.error ?? "unknown error"})`}
                </div>
              ))}
            </div>
          </div>
        )}

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
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search transactions"
                  style={{
                    padding: "6px 8px",
                    border: `1px solid ${theme.controlBorder}`,
                    background: theme.controlBg,
                    color: theme.pageFg,
                    minWidth: 180,
                  }}
                />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "date_desc" | "date_asc" | "amount_desc" | "amount_asc")}
                  style={{
                    padding: "6px 8px",
                    border: `1px solid ${theme.controlBorder}`,
                    background: theme.controlBg,
                    color: theme.pageFg,
                  }}
                >
                  <option value="date_desc">Date: newest</option>
                  <option value="date_asc">Date: oldest</option>
                  <option value="amount_desc">Amount: high to low</option>
                  <option value="amount_asc">Amount: low to high</option>
                </select>
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
                  {showSourceColumn ? <col style={{ width: 150 }} /> : null}
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
                    {showSourceColumn ? (
                      <th style={{ textAlign: "left", borderBottom: `1px solid ${theme.tableRowBorder}`, padding: "8px" }}>Source</th>
                    ) : null}
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
                      {showSourceColumn ? (
                        <td style={{ borderBottom: `1px solid ${theme.tableRowBorder}`, padding: "8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {preparedTransactions[idx]?.sourceFile ?? ""}
                        </td>
                      ) : null}
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
        <span>{`BankSheet v${__APP_VERSION__} (Public Beta)`}</span>
        <span>Statement files and transaction data are deleted after conversion.</span>
      </footer>

      </div>
    </div>
  );
}
