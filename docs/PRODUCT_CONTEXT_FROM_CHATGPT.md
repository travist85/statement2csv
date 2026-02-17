# BankSheet — Product & Competitive Context

> Status: reference input only (not canonical source of truth).
> 
> This file contains useful market/context ideas gathered earlier.
> For current project truth, see:
> - `docs/PRODUCT.md`
> - `docs/PROJECT.md`
> - `docs/DECISIONS.md`
> - `docs/PARSING.md`

## Product definition
BankSheet is a web tool that converts **digital bank statement PDFs (text-based)** into **clean CSV/XLSX spreadsheets**.

Key characteristics:

- deterministic parsing (no OCR)
- bank-specific parsers/templates
- fast conversion
- spreadsheet-ready output
- simple UX (upload → preview → download)

Primary value proposition:

> Fastest way to convert bank statements into spreadsheets.

---

# Product category
BankSheet is **not OCR / IDP software**.

It belongs to a narrower category:

> bank statement → structured data converters

Processing comparison:

**BankSheet**
PDF text → parser → structured rows → CSV/XLSX

**OCR tools**
PDF/image → OCR → text → ML → structure

Implications:

- faster
- simpler
- cheaper
- more accurate for digital PDFs

---

# Direct competitors (tier-3 bank converters)

## ProperSoft
- desktop software
- deterministic bank parsers
- CSV/XLS/QBO export
- ~$20/mo or $179/yr

Strengths:
- high accuracy
- large bank support

Weaknesses:
- desktop install
- dated UX
- not SaaS

---

## MoneyThumb
- desktop & limited web
- bank statement converters
- CSV/XLS/QBO export
- ~$5 per file

Strengths:
- accountant adoption
- reliable parsing

Weaknesses:
- expensive per file
- old UX
- fragmented products

---

## DocuClipper
- SaaS
- OCR + bank parsing hybrid
- CSV/XLS export
- ~$39/mo

Strengths:
- modern SaaS
- integrations
- batch processing

Weaknesses:
- OCR overhead
- slower conversion
- higher price

---

# Competitive positioning
Market tiers:

1. Enterprise OCR (Nanonets, Rossum)
2. Generic parsers (Docparser)
3. Bank-specific converters (ProperSoft, MoneyThumb)

BankSheet competes in tier 3.

Opportunity:

> modern SaaS + deterministic accuracy

---

# Differentiation strategy

BankSheet wins on:

- no install
- instant preview
- simple UX
- deterministic accuracy
- low cost
- bank specialization

Positioning:

> No OCR. No templates. No setup.  
> Upload bank statement → download spreadsheet.

---

# MVP scope (required)

Core MVP:

- upload PDF
- detect bank
- parse transactions
- normalize columns:
  - date
  - description
  - debit
  - credit
  - balance
- export CSV
- export XLSX
- multi-page support
- AU number/date formats

This achieves parity with ProperSoft/MoneyThumb.

---

# Competitive-edge MVP (important)

Features competitors lack:

- drag-drop upload
- instant table preview
- column rename/mapping
- date format toggle
- download in 1 click
- no signup required initially

Creates clear UX superiority.

---

# Post-MVP roadmap

## Phase 2
- batch upload
- merge multiple statements
- running balance validation
- statement period detection
- bank auto-detection improvements

## Phase 3
- categorization
- multi-currency
- API
- OCR fallback (future)

---

# Bank support roadmap

Parsers are the core moat.

## Phase 1 — Australia majors
- Commonwealth Bank
- Westpac
- ANZ
- NAB

## Phase 2 — AU secondary
- ING
- Macquarie
- Bendigo
- Suncorp
- Bankwest

## Phase 3 — global
- Chase
- Bank of America
- Wells Fargo
- Barclays
- HSBC

Strategy:

> best AU bank coverage first

---

# UX principles

BankSheet flow:

1. upload PDF
2. preview transactions
3. download sheet

No configuration.

Competitors require:

- bank selection
- template setup
- export config

---

# Accuracy principle

BankSheet uses deterministic parsing:

- exact text extraction
- consistent decimals
- stable column mapping

Advantages vs OCR:

- no OCR errors
- no row splits
- no misreads

---

# Pricing target

Competitors:

- ProperSoft: ~$20/mo
- MoneyThumb: ~$5/file
- DocuClipper: ~$39/mo

BankSheet target:

- $5–9/mo individual
- $12–19/mo SMB
- $3/file pay-as-you-go

Position:

> cheaper than SaaS OCR  
> simpler than desktop tools

---

# Key product truths

- OCR not needed for digital bank PDFs
- deterministic parsing is superior here
- bank parsers = durable asset
- UX simplicity = main differentiator
- bank coverage = moat

---

# Strategic goal

Become:

> the simplest and most accurate bank-statement-to-spreadsheet tool for AU banks.
