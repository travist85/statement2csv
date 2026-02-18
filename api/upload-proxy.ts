import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2 } from "../src/server/r2.js";

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = typeof req.query.key === "string" ? req.query.key : "";
  const contentType = typeof req.query.contentType === "string" ? req.query.contentType : "application/pdf";
  if (!key.startsWith("uploads/")) return res.status(400).json({ error: "invalid key" });
  if (!contentType.toLowerCase().includes("pdf")) return res.status(400).json({ error: "invalid content type" });

  const body = await streamToBuffer(req);
  if (!body.length) return res.status(400).json({ error: "empty file" });

  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  return res.status(200).json({ ok: true });
}

