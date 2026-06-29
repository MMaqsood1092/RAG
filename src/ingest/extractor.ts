import fs from "fs";
import path from "path";
// Use require here to avoid type issues with pdf-parse and tesseract.js in ts-node.
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
const pdfParse: any = require("pdf-parse");
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
const Tesseract: any = require("tesseract.js");

export async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  // Plain text–like files we can read directly.
  if (
    ext === ".txt" ||
    ext === ".md" ||
    ext === ".log" ||
    ext === ".csv" ||
    ext === ".json" ||
    ext === ".eml" ||
    ext === ".mot"
  ) {
    return fs.readFileSync(filePath, "utf8");
  }

  // PDFs: use pdf-parse to extract text content.
  if (ext === ".pdf") {
    const data = await fs.promises.readFile(filePath);
    const pdf = await pdfParse(data);
    return pdf.text || "";
  }

  // Excel: extract sheet data as text using xlsx.
  if (ext === ".xlsx" || ext === ".xls") {
    const base = path.basename(filePath);
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
      const XLSX = require("xlsx");
      const workbook = XLSX.readFile(filePath);
      const parts: string[] = [];
      for (const sheetName of workbook.SheetNames ?? []) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        const csv = XLSX.utils.sheet_to_csv(sheet);
        parts.push(`Sheet: ${sheetName}\n${csv}`);
      }
      const text = parts.join("\n\n");
      const header = `Excel attachment: ${base} (stored at ${filePath})\n\n`;
      return text.trim() ? header + text : header + "(No data in sheets.)";
    } catch {
      const baseName = path.basename(filePath);
      return `Excel attachment: ${baseName} (stored at ${filePath}). Content extraction failed or is not supported.`;
    }
  }

  // PowerPoint: extract slide text with node-pptx-parser.
  if (ext === ".pptx") {
    const base = path.basename(filePath);
    try {
      const PptxParser = require("node-pptx-parser").default;
      const parser = new PptxParser(filePath);
      const slides = await parser.extractText();
      const parts = (slides || []).map(
        (s: { id?: string; text?: string[] }) =>
          `Slide ${s.id ?? "?"}: ${(s.text ?? []).join(" ")}`,
      );
      const slideText = parts.filter(Boolean).join("\n\n");
      const header = `PowerPoint attachment: ${base} (stored at ${filePath})\n\n`;
      return slideText.trim() ? header + slideText : header + "(No text extracted from slides.)";
    } catch {
      const baseName = path.basename(filePath);
      return `PowerPoint attachment: ${baseName} (stored at ${filePath}). Content extraction failed or is not supported.`;
    }
  }

  // Images and other binary attachments: we don't have OCR here, but we still
  // want something indexable. Use OCR via tesseract.js to extract any visible
  // text, and prefix it with a short caption so the file itself is referenced.
  if (
    ext === ".png" ||
    ext === ".jpg" ||
    ext === ".jpeg" ||
    ext === ".gif" ||
    ext === ".webp"
  ) {
    const base = path.basename(filePath);
    try {
      const result = await Tesseract.recognize(filePath, "eng");
      const ocrText: string = result?.data?.text ?? "";
      console.log('ocr text: ', ocrText)
      const header = `Image attachment: ${base} (stored at ${filePath})`;
      return ocrText
        ? `${header}\n\nOCR text:\n${ocrText}`
        : header;
    } catch {
      // If OCR fails for any reason, fall back to a simple caption.
      return `Image attachment: ${base} (stored at ${filePath})`;
    }
  }

  // Fallback: best-effort UTF-8 read; if it fails, return a minimal marker.
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    const base = path.basename(filePath);
    return `Binary attachment: ${base} (stored at ${filePath})`;
  }
}
