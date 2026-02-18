# statement2csv

Last updated: 2026-02-18

## Goal

Convert bank statement PDFs into structured transactions for spreadsheet/accounting workflows.

Current delivery target:
- reliable PDF -> preview -> export flow
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
- Public brand in UI/domain: `BankSheet` (`banksheet.co`)
- Repo/package name remains `statement2csv` for now

## Current shipped capabilities

- Multi-PDF batch upload and conversion
- Transaction preview with date sorting
- Export formats: CSV, XLSX, OFX, QIF
- CSV/XLSX target mapping: Generic, Xero, QuickBooks, MYOB
- Per-file download + `Download All` (ZIP separate files or one combined output)

## Related docs

- Product definition: `docs/PRODUCT.md`
- Roadmap and scope: `docs/ROADMAP.md`
- SEO operating system: `docs/SEO_OPERATIONS_PLAN.md`
