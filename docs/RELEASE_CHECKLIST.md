# Release Checklist

Use this checklist before each MVP production deployment.

## 1) Keep scope tight

- Ship only reliability or clarity improvements
- Avoid adding new major features during traction phase
- Confirm no sensitive files are tracked (`git status`, `.gitignore`)

## 2) Local quality gate (must pass)

- `npm run lint`
- `npm test`
- `npm run build`

## 3) Manual smoke test (must pass)

- Upload sample statement PDF
- Convert and confirm non-zero rows for expected sample
- Verify CSV downloads and columns match selected export settings
- Confirm issue link is visible and working

## 4) Privacy check

- Confirm delete-after-conversion behavior still active
- Confirm no secrets or private test data are in repo/deploy

## 5) Deploy

- Merge to `main` (or deploy prebuilt)
- Confirm Vercel deployment is `Ready`

## 6) Post-deploy check (production URL)

- Run one end-to-end conversion
- Confirm no critical regression in upload/convert/export flow

## 7) Feedback loop

- Review new issues/questions weekly
- Prioritize fixes based on repeated real user pain
