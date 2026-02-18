import type { VercelRequest, VercelResponse } from "@vercel/node";

const ALLOWED_EVENTS = new Set([
  "page_view",
  "convert_clicked",
  "convert_success",
  "convert_error",
  "download_csv",
  "download_xlsx",
  "contact_clicked",
]);

function sanitizeMeta(input: unknown): Record<string, string | number | boolean | null> | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input)) {
    if (Object.keys(out).length >= 20) break;
    if (typeof value === "string") out[key] = value.slice(0, 120);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
  const event = typeof body.event === "string" ? body.event : "";
  if (!ALLOWED_EVENTS.has(event)) return res.status(400).json({ error: "invalid event" });

  const clientId = typeof body.clientId === "string" ? body.clientId.slice(0, 120) : "unknown";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 120) : "unknown";
  const path = typeof body.path === "string" ? body.path.slice(0, 200) : "/";
  const ts = typeof body.ts === "string" ? body.ts : new Date().toISOString();
  const meta = sanitizeMeta(body.meta);

  console.log(
    JSON.stringify({
      type: "analytics_event",
      event,
      clientId,
      sessionId,
      path,
      ts,
      meta,
    })
  );

  return res.status(202).json({ ok: true });
}
