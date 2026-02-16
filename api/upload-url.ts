import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2 } from "../src/server/r2";

function safeKey(originalName: string) {
  const name = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `uploads/${ts}-${Math.random().toString(16).slice(2)}-${name}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { filename, contentType } = req.body ?? {};
  if (!filename || typeof filename !== "string") return res.status(400).json({ error: "filename required" });

  const ct = typeof contentType === "string" ? contentType : "application/pdf";
  if (!ct.toLowerCase().includes("pdf")) return res.status(400).json({ error: "Only PDFs supported in MVP" });

  const Bucket = process.env.R2_BUCKET!;
  const Key = safeKey(filename);

  const cmd = new PutObjectCommand({
    Bucket,
    Key,
    ContentType: ct
  });

  const uploadUrl = await getSignedUrl(r2, cmd, { expiresIn: 60 * 5 });
  res.status(200).json({ uploadUrl, key: Key });
}
