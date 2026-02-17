import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseAmount, parseDate, parseStatementText } from "../src/server/parsing";

describe("parseDate", () => {
  it("parses common date formats", () => {
    expect(parseDate("2026-02-16")).toBe("2026-02-16");
    expect(parseDate("16/02/2026")).toBe("2026-02-16");
    expect(parseDate("02/16/2026")).toBe("2026-02-16");
    expect(parseDate("16 Feb 2026")).toBe("2026-02-16");
  });
});

describe("parseAmount", () => {
  it("handles signed, dr/cr, and parenthesized amounts", () => {
    expect(parseAmount("-54.23")).toBe(-54.23);
    expect(parseAmount("(54.23)")).toBe(-54.23);
    expect(parseAmount("54.23 DR")).toBe(-54.23);
    expect(parseAmount("54.23 CR")).toBe(54.23);
    expect(parseAmount("2,450.77")).toBe(2450.77);
  });
});

describe("parseStatementText", () => {
  it("extracts normalized transactions from statement-like text", () => {
    const fixture = readFileSync("tests/fixtures/sample-statement.txt", "utf8");
    const result = parseStatementText(fixture);

    expect(result.transactions).toHaveLength(3);
    expect(result.transactions[0]).toEqual({
      date: "2026-01-15",
      description: "Grocery Store Purchase",
      amount: -54.23,
      balance: 2450.77,
    });
    expect(result.transactions[1]).toEqual({
      date: "2026-01-16",
      description: "PAYROLL DEPOSIT",
      amount: 2500,
      balance: 4950.77,
    });
    expect(result.transactions[2]).toEqual({
      date: "2026-01-17",
      description: "ONLINE TRANSFER TO SAVINGS WEEKLY AUTO MOVE",
      amount: -100,
      balance: 4850.77,
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.warnings).toHaveLength(0);
  });

  it("parses date+description lines followed by amount lines and infers day-first dates", () => {
    const statement = [
      "DateDescriptionAmountBalance",
      "15/02/2026VISA-OPENAI *CHATGPT SUBSCR DUBLIN IEFRGN",
      "-$32.13$12,424.08",
      "10/02/2026VISA-AMAZON RETA* AMAZON AU SYDNEY AU#6071356(Ref.021002016307)",
      "-$49.00$11,229.62",
    ].join("\n");

    const result = parseStatementText(statement);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toEqual({
      date: "2026-02-15",
      description: "VISA-OPENAI *CHATGPT SUBSCR DUBLIN IEFRGN",
      amount: -32.13,
      balance: 12424.08,
    });
    expect(result.transactions[1]).toEqual({
      date: "2026-02-10",
      description: "VISA-AMAZON RETA* AMAZON AU SYDNEY AU#6071356(Ref.021002016307)",
      amount: -49,
      balance: 11229.62,
    });
  });

  it("treats debit-column statement rows as outflows and ignores rate percentages", () => {
    const fixture = readFileSync("tests/fixtures/nab-debits-statement.txt", "utf8");
    const result = parseStatementText(fixture);

    expect(result.transactions).toHaveLength(9);
    expect(result.transactions[0]).toEqual({
      date: "2026-01-19",
      description: "SuperChoice",
      amount: -792,
      balance: 71187.06,
    });
    expect(result.transactions[4]).toEqual({
      date: "2026-02-02",
      description: "741023192 BizCover Polygon Design S",
      amount: -228.09,
      balance: 66190.23,
    });
    expect(result.transactions.some((t) => t.amount === 14.91)).toBe(false);
    expect(result.debug).toMatchObject({
      hasDebitCreditBalanceHeader: true,
    });
  });

  it("uses balance movement to validate inferred debit/credit signs", () => {
    const statement = [
      "Opening Balance$100.00 CR",
      "DateDetailsDebitsCreditsBalance",
      "01 Jan 26Payment A$10.00$110.00 CR",
      "02 Jan 26Payment B$5.00$115.00 CR",
      "03 Jan 26Payment C$20.00$135.00 CR",
    ].join("\n");

    const result = parseStatementText(statement);
    const amounts = result.transactions.map((t) => t.amount);

    expect(amounts).toEqual([10, 5, 20]);
    expect(result.debug).toMatchObject({
      hasDebitCreditBalanceHeader: true,
      autoInvertedInferredSigns: false,
    });
  });

  it("parses glued year+merchant digit without corrupting date or description", () => {
    const statement = [
      "Transaction history",
      "Date Description Money in Money out Balance",
      "6 Feb 20267-ELEVEN 3058 -$6.80 $5.09",
    ].join("\n");

    const result = parseStatementText(statement);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toEqual({
      date: "2026-02-06",
      description: "7-ELEVEN 3058",
      amount: -6.8,
      balance: 5.09,
    });
  });
});
