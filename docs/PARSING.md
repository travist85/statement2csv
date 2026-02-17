# Parsing strategy

Last updated: 2026-02-17

## Input types

- Text PDF (selectable/extractable text) -> in scope now
- Scanned/image PDF -> deferred (OCR not in current MVP)

## Current parser model

- deterministic text extraction + normalization
- generic layout heuristics
- regression fixtures for real-world statement variants
- confidence + warnings returned with parse result

## Canonical schema

- date (ISO `YYYY-MM-DD`)
- description
- amount (signed)
- currency (optional)
- balance (optional)

## Validation principles

- parse candidate row detection from extracted text
- row-level date/amount validation
- confidence derived from valid-row ratio + sample size
- statement-level sanity checks (for example: sign direction vs balance movement)

## Bank-specific vs generic (active decision)

Current posture:
- generic-first with tests

Escalate to bank-specific parsing when:
- repeated failures cluster to a specific bank layout
- generic rules become brittle or regress across fixtures
- fixes require column-position logic unique to one format

Target architecture (if needed):
- generic parser baseline
- optional bank/layout override modules
- shared normalization + export schema
