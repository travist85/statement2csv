import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { r2 } from "../src/server/r2.js";
import { extractTextFromPdf, parseStatementText } from "../src/server/parsing.js";

const PARSER_VERSION = "2026-02-17-generic-v1";

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

  let pdfBytes = 0;
  try {
    const obj = await r2.send(new GetObjectCommand({ Bucket, Key: key }));
    const pdf = await streamToBuffer(obj.Body);
    pdfBytes = pdf.length;

    const extractedText = await extractTextFromPdf(pdf);
    const parseResult = parseStatementText(extractedText);

    const warnings = [...parseResult.warnings];
    if (!extractedText.trim()) {
      warnings.push("No text extracted from PDF. OCR fallback is not implemented yet.");
    }

    res.status(200).json({
      ok: true,
      transactions: parseResult.transactions,
      warnings,
      confidence: parseResult.confidence,
      debug: {
        parserVersion: PARSER_VERSION,
        bytes: pdfBytes,
        extractedChars: extractedText.length,
        ...parseResult.debug,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown parse failure";
    console.error("parse failed", err);
    res.status(500).json({
      ok: false,
      error: `Failed to parse statement PDF: ${message}`,
      warnings: [message],
      confidence: 0,
      transactions: [],
      debug: { parserVersion: PARSER_VERSION, bytes: pdfBytes },
    });
  } finally {
    try {
      await r2.send(new DeleteObjectCommand({ Bucket, Key: key }));
    } catch {
      // Best-effort delete; parsing response has already been determined.
    }
  }
}
