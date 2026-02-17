# statement2csv

Last updated: 2026-02-16

## Goal
Convert bank statement PDFs into structured transactions (CSV/JSON) for accounting import.

## Primary users
- freelancers / sole traders
- small businesses
- landlords
- bookkeepers / accountants
- individuals reconciling finances

## Constraints
- Deploy on Vercel
- Use Cloudflare R2 for temporary storage
- Privacy-first: delete uploads after parsing
- MVP: text PDFs first, OCR fallback for scans
