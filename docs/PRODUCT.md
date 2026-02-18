# Product

Last updated: 2026-02-17

## Product identity

- Current working name: `statement2csv`
- Planned rename candidate: `BankSheet` / `BankSheets`
- Naming decision is deferred until early traction signal is confirmed.

## Product definition

Web tool to convert text-based bank statement PDFs into structured transaction exports.

Current flow:
- upload statement PDF
- parse and preview transactions
- export CSV/XLSX

Current export options:
- single signed amount or split debit/credit columns
- sign handling controls
- CSV or XLSX download

## Category and positioning

This product sits in:

> bank statement PDF -> structured transaction converters

It is not currently an enterprise OCR/IDP platform.

Positioning (MVP):

> Fast, privacy-first statement conversion for bookkeeping and reconciliation workflows.

## Primary users

- bookkeepers/accountants handling mixed statement formats
- small business operators doing monthly reconciliation
- users backfilling historical statements into spreadsheets/accounting tools

## Problem we solve

Even when banks offer exports or open banking, users still hit:
- inconsistent formats across institutions
- historical data trapped in PDF statements
- missing/limited export options for specific accounts or periods
- heavy manual cleanup after export

## Current MVP scope (shipped)

- text-based PDF parsing
- transaction preview in UI
- CSV export
- privacy messaging + delete-after-conversion behavior
- issue reporting path for parser feedback

## Not in MVP (deferred)

- OCR fallback for scanned PDFs
- XLSX/OFX/QIF exports
- batch conversion
- user accounts/history
- categorization/integrations

## Competitive context (condensed)

Useful reference from `PRODUCT_CONTEXT_FROM_CHATGPT.md`:
- tier-3 bank statement conversion tools are real and established
- desktop-heavy incumbents create SaaS UX opportunity
- deterministic text parsing can outperform OCR for digital PDFs

What we are intentionally not assuming yet:
- immediate feature parity with all incumbent exports
- broad bank coverage before first traction

## Pricing direction (MVP validation)

Working pricing hypothesis to validate:
- performance-based pricing (`no results, no fee`)

Interpretation:
- if a conversion produces no usable transaction output, user should not be charged
- monetization should align to successful conversion outcomes, not raw upload attempts

## Parsing strategy: open decision

Current implementation is generic heuristic parsing with regression tests.

Open decision:
- `Option A`: generic heuristic-first parser with expanding fixtures
- `Option B`: bank-specific parser templates
- `Option C` (likely): hybrid model
  - generic parser as baseline
  - bank/layout-specific overrides only where needed

Decision trigger:
- If repeated failures cluster by bank/layout and generic fixes become brittle, add targeted bank modules.

## Traction-mode product rule

Until real engagement appears, prioritize:
- conversion reliability
- trust/privacy clarity
- fast bug turnaround from user-reported samples

Avoid adding broad new feature surface before this signal exists.

Related execution doc:
- `docs/SEO_OPERATIONS_PLAN.md`
