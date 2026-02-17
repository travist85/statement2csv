# Parsing strategy

Statement types:
- Text PDF (selectable text)
- Scanned PDF (image) -> OCR

MVP approach:
- Text-first extraction
- OCR fallback only when necessary (empty/low-confidence text extraction)

Canonical schema:
- date (YYYY-MM-DD)
- description
- amount (signed)
- currency (optional)
- balance (optional)

Validation:
- >= N rows
- >= 80% rows have valid date + amount
- amounts parse as numbers
