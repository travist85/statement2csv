# Architecture

1) Browser requests pre-signed upload URL from `POST /api/upload-url`
2) Browser uploads PDF directly to Cloudflare R2
3) Browser calls `POST /api/parse` with `{ key }`
4) Backend downloads from R2, parses into normalized transactions, returns JSON
5) Backend deletes the object in R2

Rationale:
Vercel function request body limits make direct PDF uploads unreliable; use direct-to-R2 upload.
