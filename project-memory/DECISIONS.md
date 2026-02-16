# Decisions

Last updated: 2026-02-16

- Repo name: statement2csv
- Hosting: Vercel
- Storage: Cloudflare R2 (S3-compatible)
- Upload method: pre-signed direct-to-R2 upload
- Parsing approach: text-first + OCR fallback
- MVP excludes DB/logins/integrations
