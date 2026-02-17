# statement2csv

Convert bank statement PDFs into structured CSV transactions.

## What this repo contains

- **React + Vite** frontend for uploading a PDF and previewing parsed transactions.
- **Vercel serverless functions** for:
  - issuing **Cloudflare R2 pre-signed upload URLs** (direct-to-R2 upload)
  - fetching the uploaded PDF from R2 and parsing transactions (text-PDF MVP)
- `/docs` Markdown files that preserve project context for Codex/AI tools.

## Architecture (high level)

1. Browser requests a signed upload URL from `POST /api/upload-url`
2. Browser uploads the PDF directly to **Cloudflare R2**
3. Browser calls `POST /api/parse` with the returned `key`
4. Backend downloads the PDF from R2, parses it into transactions, returns JSON
5. Frontend renders a preview and offers CSV download
6. Backend deletes the uploaded PDF from R2 (privacy-first)

## Getting started (local)

1) Install deps

```bash
npm install
```

2) Create `.env.local` from `.env.example` and fill in values

3) Run frontend-only dev server

```bash
npm run dev
```

> Note: Vercel `/api/*` routes run in Vercel. For local development, you can:
> - use `npm run vercel:dev` (recommended), or
> - deploy and point frontend to production API endpoints

## Quick test flow

Use this when you want to verify browser behavior quickly without local `vercel dev` issues.

1) Build prebuilt artifacts:

```bash
npm run vercel:build
```

2) Deploy prebuilt output and open the URL:

```bash
npm run vercel:deploy:prebuilt
```

3) In the browser:
- upload a PDF
- click `Convert`
- verify preview rows
- click `Download CSV`

## Local full-stack flow

If local dev works on your machine, use:

```bash
npm run vercel:dev
```

If Vercel CLI fails locally on Windows, use the quick test flow above as the fallback path.

## Deploy

- Push to GitHub
- Import repo into Vercel
- Set environment variables from `.env.example`
- Deploy

## Project context

See `/docs` for constraints, decisions, and parsing strategy.
