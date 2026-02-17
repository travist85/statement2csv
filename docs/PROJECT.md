# statement2csv

Last updated: 2026-02-17

## Goal

Convert bank statement PDFs into structured transactions for spreadsheet/accounting workflows.

Current delivery target:
- reliable PDF -> preview -> CSV flow
- early user engagement and parser feedback

## Primary users

- bookkeepers / accountants
- small business operators
- users migrating or reconciling historical statement data

## Constraints

- Hosting: Vercel
- Temp storage: Cloudflare R2
- Privacy-first: delete uploads after parsing/conversion
- MVP focus: text-based PDFs first

## Product naming

- Working name: `statement2csv`
- Planned rename: likely `BankSheet` / `BankSheets` after early traction validation
