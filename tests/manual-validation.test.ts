import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { extractTextFromPdf, parseStatementText } from "../src/server/parsing";

type ValidationIssue = {
  type: "date-outlier" | "description-mismatch";
  index: number;
  date: string;
  description: string;
  detail: string;
};

function compact(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function yearFromIso(date: string): number {
  return Number(date.slice(0, 4));
}

function mode(values: number[]): number | null {
  if (!values.length) return null;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = -1;
  for (const [k, c] of counts) {
    if (c > bestCount) {
      best = k;
      bestCount = c;
    }
  }
  return best;
}

function validateAgainstSource(text: string, transactions: { date: string; description: string }[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const sourceCompact = compact(text);
  const yearMode = mode(transactions.map((t) => yearFromIso(t.date)));

  transactions.forEach((tx, idx) => {
    const txYear = yearFromIso(tx.date);
    if (yearMode != null && Math.abs(txYear - yearMode) > 1) {
      issues.push({
        type: "date-outlier",
        index: idx,
        date: tx.date,
        description: tx.description,
        detail: `Year ${txYear} is an outlier vs mode year ${yearMode}`,
      });
    }

    const descCompact = compact(tx.description);
    if (descCompact.length >= 8 && !sourceCompact.includes(descCompact)) {
      issues.push({
        type: "description-mismatch",
        index: idx,
        date: tx.date,
        description: tx.description,
        detail: "Description sequence not found in extracted source text",
      });
    }
  });

  return issues;
}

describe("manual PDF validation", () => {
  const pdfs = ["tests/manual/BankAust.pdf", "tests/manual/ING.pdf", "tests/manual/NAB.pdf"];

  for (const pdf of pdfs) {
    it(`validates ${pdf}`, async () => {
      const pdfBuffer = readFileSync(pdf);
      const text = await extractTextFromPdf(pdfBuffer);
      const parsed = parseStatementText(text);
      const issues = validateAgainstSource(text, parsed.transactions);

      if (issues.length) {
        const preview = issues
          .slice(0, 10)
          .map((i) => `${i.type} row=${i.index} date=${i.date} desc="${i.description}" detail=${i.detail}`)
          .join("\n");
        throw new Error(`Validation issues in ${pdf}:\n${preview}`);
      }

      expect(parsed.transactions.length).toBeGreaterThan(0);
    }, 120_000);
  }
});

