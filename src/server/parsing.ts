export type Transaction = {
  date: string;
  description: string;
  amount: number;
  currency?: string;
  balance?: number;
};

export type ParseResult = {
  transactions: Transaction[];
  warnings: string[];
  confidence: number;
  debug: Record<string, unknown>;
};
type DateOrderPreference = "day-first" | "month-first";

const DATE_AT_START =
  /^(\d{4}[/.-]\d{1,2}[/.-]\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}(?:\s+\d{2,4})?|[A-Za-z]{3,9}\s+\d{1,2}(?:,?\s+\d{2,4})?)/;
const HEADER_LINE = /\b(date|description|amount|balance|debit|credit)\b/i;
const METADATA_LINE =
  /^(date:\s|transaction:\s|showing:\s|order:\s|historyhttps?:|account\s+history|uncleared\s+funds\b|\d+\s+of\s+\d+\b)/i;
const AMOUNT_TOKEN = /(?:\(\$?\d[\d,]*\.\d{2}\)|-?\$?\d[\d,]*\.\d{2})(?:\s?(?:CR|DR))?/gi;
const HAS_AMOUNT_TOKEN = /(?:\(\$?\d[\d,]*\.\d{2}\)|-?\$?\d[\d,]*\.\d{2})(?:\s?(?:CR|DR))?/i;
const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function toIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeYear(year: number): number {
  if (year < 100) return year >= 70 ? 1900 + year : 2000 + year;
  return year;
}

export function parseDate(raw: string, preference?: DateOrderPreference): string | null {
  const value = raw.trim();
  const currentYear = new Date().getUTCFullYear();

  let m = value.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (m) return toIsoDate(Number(m[1]), Number(m[2]), Number(m[3]));

  m = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const first = Number(m[1]);
    const second = Number(m[2]);
    const year = normalizeYear(Number(m[3]));
    if (first > 12) return toIsoDate(year, second, first);
    if (second > 12) return toIsoDate(year, first, second);
    if (preference === "day-first") return toIsoDate(year, second, first);
    if (preference === "month-first") return toIsoDate(year, first, second);
    return toIsoDate(year, first, second);
  }

  m = value.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = MONTHS[m[2].toLowerCase()];
    if (!month) return null;
    const year = normalizeYear(Number(m[3]));
    return toIsoDate(year, month, day);
  }

  m = value.match(/^(\d{1,2})\s+([A-Za-z]{3,9})$/);
  if (m) {
    const day = Number(m[1]);
    const month = MONTHS[m[2].toLowerCase()];
    if (!month) return null;
    return toIsoDate(currentYear, month, day);
  }

  m = value.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?:,?\s+(\d{2,4}))?$/);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    const day = Number(m[2]);
    if (!month) return null;
    const year = m[3] ? normalizeYear(Number(m[3])) : currentYear;
    return toIsoDate(year, month, day);
  }

  return null;
}

export function parseAmount(raw: string): number | null {
  const normalized = raw.trim().toUpperCase();
  if (!normalized) return null;

  const isCredit = /\bCR\b/.test(normalized);
  const isDebit = /\bDR\b/.test(normalized);
  const isParenNegative = normalized.includes("(") && normalized.includes(")");
  const isMinusNegative = /(^|[^\d])-\s*\$?\d/.test(normalized);

  const numeric = normalized
    .replace(/\bCR\b|\bDR\b/g, "")
    .replace(/[(),$]/g, "")
    .replace(/\s+/g, "");

  if (!/^-?\d[\d,]*\.?\d*$/.test(numeric)) return null;
  const amount = Number(numeric.replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;

  let sign = amount < 0 ? -1 : 1;
  if (isParenNegative || isMinusNegative || isDebit) sign = -1;
  if (isCredit) sign = 1;
  return Math.abs(amount) * sign;
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function isCandidateLine(line: string): boolean {
  if (!line || METADATA_LINE.test(line)) return false;
  if (HEADER_LINE.test(line) && !DATE_AT_START.test(line)) return false;
  return DATE_AT_START.test(line);
}

function isLikelyContinuation(line: string): boolean {
  if (!line) return false;
  if (METADATA_LINE.test(line)) return false;
  if (HEADER_LINE.test(line)) return false;
  if (isCandidateLine(line)) return false;
  return !HAS_AMOUNT_TOKEN.test(line);
}

function parseTransactionLine(line: string, datePreference?: DateOrderPreference): Transaction | null {
  const clean = normalizeLine(line);
  if (METADATA_LINE.test(clean)) return null;
  const dateMatch = clean.match(DATE_AT_START);
  if (!dateMatch) return null;

  const dateRaw = dateMatch[1];
  const date = parseDate(dateRaw, datePreference);
  if (!date) return null;

  const remainder = clean.slice(dateRaw.length).trim();
  const amountMatches = [...remainder.matchAll(AMOUNT_TOKEN)];
  if (!amountMatches.length) return null;

  const amountIndex = amountMatches.length >= 2 ? amountMatches.length - 2 : amountMatches.length - 1;
  const amountRaw = amountMatches[amountIndex][0];
  const amount = parseAmount(amountRaw);
  if (amount == null) return null;

  let balance: number | undefined;
  let descriptionPart = remainder.slice(0, amountMatches[amountIndex].index).trim();
  if (amountMatches.length >= 2) {
    const maybeBalanceRaw = amountMatches[amountMatches.length - 1][0];
    const maybeBalance = parseAmount(maybeBalanceRaw);
    if (maybeBalance != null) {
      balance = maybeBalance;
      descriptionPart = remainder.slice(0, amountMatches[amountIndex].index).trim();
    }
  }

  const description = descriptionPart.replace(/\s+/g, " ").trim();
  if (!description || HEADER_LINE.test(description)) return null;

  return { date, description, amount, balance };
}

function detectDatePreference(lines: string[]): DateOrderPreference | undefined {
  let dayFirstSignals = 0;
  let monthFirstSignals = 0;

  for (const line of lines) {
    const dateMatch = line.match(DATE_AT_START);
    if (!dateMatch) continue;
    const raw = dateMatch[1];
    const parts = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (!parts) continue;

    const first = Number(parts[1]);
    const second = Number(parts[2]);
    if (first > 12 && second <= 12) dayFirstSignals += 1;
    if (second > 12 && first <= 12) monthFirstSignals += 1;
  }

  if (dayFirstSignals > monthFirstSignals) return "day-first";
  if (monthFirstSignals > dayFirstSignals) return "month-first";
  return undefined;
}

export function parseStatementText(text: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  const datePreference = detectDatePreference(lines);
  const transactions: Transaction[] = [];
  let candidateRows = 0;
  let pendingCandidate: string | null = null;

  for (const line of lines) {
    const isCandidate = isCandidateLine(line);
    if (isCandidate) candidateRows += 1;

    if (pendingCandidate && !isCandidate) {
      const combined = `${pendingCandidate} ${line}`.trim();
      const combinedParsed = parseTransactionLine(combined, datePreference);
      if (combinedParsed) {
        transactions.push(combinedParsed);
        pendingCandidate = null;
        continue;
      }
      pendingCandidate = isLikelyContinuation(line) ? combined : null;
      continue;
    }

    const parsed = parseTransactionLine(line, datePreference);
    if (parsed) {
      transactions.push(parsed);
      pendingCandidate = null;
      continue;
    }

    if (isCandidate) {
      pendingCandidate = line;
      continue;
    }

    if (transactions.length > 0 && isLikelyContinuation(line)) {
      const prev = transactions[transactions.length - 1];
      prev.description = `${prev.description} ${line}`.trim();
    }
  }

  const validRows = transactions.filter((t) => Boolean(t.date) && Number.isFinite(t.amount)).length;
  const ratio = candidateRows > 0 ? validRows / candidateRows : 0;
  const sizeFactor = Math.min(1, validRows / 8);
  const confidence = candidateRows === 0 ? 0 : Number((ratio * 0.7 + sizeFactor * 0.3).toFixed(2));

  const warnings: string[] = [];
  if (candidateRows === 0) warnings.push("No transaction-like rows were detected in extracted text.");
  if (validRows > 0 && validRows < 3) warnings.push("Few rows were parsed; review output carefully.");
  if (ratio > 0 && ratio < 0.8) warnings.push("Low parse reliability: fewer than 80% of candidate rows were valid.");

  return {
    transactions,
    warnings,
    confidence,
    debug: {
      candidateRows,
      parsedRows: transactions.length,
      validRows,
      validRatio: Number(ratio.toFixed(2)),
      datePreference: datePreference ?? "unspecified",
    },
  };
}

export async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  type PdfParseFn = (buffer: Buffer) => Promise<{ text?: string }>;
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  const parsePdf = ((mod as { default?: unknown }).default ?? mod) as PdfParseFn;
  if (typeof parsePdf !== "function") throw new Error("pdf parser export not callable");
  const parsed = await parsePdf(pdfBuffer);
  return parsed.text ?? "";
}
