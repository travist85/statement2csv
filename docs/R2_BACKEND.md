# Vercel + Cloudflare R2 backend

Endpoints:

POST /api/upload-url
- returns pre-signed PUT URL + object key

POST /api/parse
- downloads PDF from R2
- parses -> transactions JSON
- deletes object
- returns JSON

Privacy:
- do not persist PDFs
- avoid logging contents
