import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { r2 } from "../src/server/r2";

async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { key } = req.body ?? {};
  if (!key || typeof key !== "string") return res.status(400).json({ error: "key required" });
  if (!key.startsWith("uploads/")) return res.status(400).json({ error: "invalid key" });

  const Bucket = process.env.R2_BUCKET!;

  // 1) download from R2
  const obj = await r2.send(new GetObjectCommand({ Bucket, Key: key }));
  const pdf = await streamToBuffer(obj.Body);

  // 2) TODO: parse PDF into transactions (text-first + OCR fallback).
  const transactions: any[] = [];
  const warnings = [
    "Parsing not implemented yet. This endpoint currently returns an empty transaction list."
  ];

  // 3) delete after processing (privacy-first)
  await r2.send(new DeleteObjectCommand({ Bucket, Key: key }));

  res.status(200).json({
    ok: true,
    transactions,
    warnings,
    confidence: 0,
    debug: { bytes: pdf.length }
  });
}
