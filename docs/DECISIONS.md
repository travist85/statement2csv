# Decisions

Last updated: 2026-02-17

## Decided

- Working repo/product name remains `statement2csv` for now.
- Hosting: Vercel.
- Storage: Cloudflare R2 (S3-compatible).
- Upload method: pre-signed direct-to-R2 upload.
- Privacy model: files deleted after conversion/parsing.
- MVP excludes accounts, persistent history, and deep integrations.
- Current parser approach: text-first deterministic parsing with regression tests.

## Open

- Parser architecture direction:
  - stay mostly generic heuristic, or
  - introduce bank-specific parser modules, or
  - use hybrid (generic baseline + targeted overrides).
- OCR timing:
  - keep deferred until traction, or
  - pull forward if scanned-PDF demand dominates feedback.
- Rename timing:
  - keep `statement2csv` during MVP, move to `BankSheet`/`BankSheets` post-traction.
