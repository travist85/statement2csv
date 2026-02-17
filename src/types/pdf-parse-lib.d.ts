declare module "pdf-parse/lib/pdf-parse.js" {
  type PdfParseResult = { text?: string };
  type PdfParseFn = (buffer: Buffer) => Promise<PdfParseResult>;
  const pdfParse: PdfParseFn;
  export default pdfParse;
}
