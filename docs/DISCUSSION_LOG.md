# Discussion log (condensed)

Last updated: 2026-02-18

- Goal: multi-bank statement PDF -> structured export converter
- Choose Vercel + R2 for a tiny backend
- Use text-first parsing (covers most modern statements)
- Defer OCR fallback for scans
- Privacy-first: delete files after parsing
- Added batch upload and robust export options (CSV/XLSX/OFX/QIF)
- Added per-file download + Download All modes (ZIP or combined output)
- UI refined toward simple workflow clarity; kept text-only brand header for now
