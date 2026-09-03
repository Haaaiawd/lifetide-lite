import { pdfToPng, VerbosityLevel, type PngPageOutput } from "pdf-to-png-converter";
import mammoth from "mammoth";
import { extractTextFromImageBase64 } from "@/lib/ai/vision";

export type ExtractionResult = {
  previewText: string;
};

function toDataUrl(mime: string, buffer: Buffer): string {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

// Try to extract text directly from the PDF's text layer using pdfjs.
// This is near-instant for text-based PDFs (no OCR needed).
// Returns null if the PDF has no usable text layer (scanned/image PDFs).
async function extractPdfTextLayer(buffer: Buffer): Promise<string | null> {
  try {
    // pdfjs needs a fake DOM environment in Node.js. We use the legacy build
    // with minimal globals.
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const data = new Uint8Array(buffer);
    const doc = await pdfjs.getDocument({
      data,
      useSystemFonts: true,
    }).promise;

    const textParts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: unknown) => {
          if (typeof item === "object" && item !== null && "str" in item) {
            return (item as { str: string }).str;
          }
          return "";
        })
        .join("")
        .trim();
      if (pageText) textParts.push(pageText);
    }

    await doc.cleanup();
    const fullText = textParts.join("\n\n").trim();
    // If we got meaningful text (at least 100 chars), use it.
    // Otherwise fall back to OCR.
    return fullText.length >= 100 ? fullText : null;
  } catch {
    // If pdfjs fails for any reason, fall back to OCR
    return null;
  }
}

export async function extractFromBuffer(
  buffer: Buffer,
  mime: string,
  parser: "text" | "markdown" | "json" | "pdf" | "docx" | "image"
): Promise<ExtractionResult> {
  if (parser === "image") {
    const dataUrl = toDataUrl(mime, buffer);
    const result = await extractTextFromImageBase64([dataUrl]);
    return { previewText: result.text };
  }

  if (parser === "pdf") {
    // Fast path: try extracting the text layer directly (near-instant for
    // text-based PDFs like academic papers, resumes, etc.)
    const textLayer = await extractPdfTextLayer(buffer);
    if (textLayer) {
      return { previewText: textLayer };
    }
    // Slow path: scanned/image PDF — convert to PNG and OCR
    const pngs = await convertPdfToPng(buffer);
    const dataUrls = pngs.map((b) => toDataUrl("image/png", b));
    const result = await extractTextFromImageBase64(dataUrls);
    return { previewText: result.text };
  }

  if (parser === "docx") {
    const raw = await mammoth.extractRawText({ buffer });
    return { previewText: raw.value };
  }

  if (parser === "json") {
    try {
      const parsed = JSON.parse(buffer.toString("utf-8"));
      let text: string;
      if (typeof parsed === "string") text = parsed;
      else if (Array.isArray(parsed)) text = parsed
        .filter((v) => v !== null && v !== undefined)
        .map((v) => typeof v === "string" ? v : String(v))
        .join("\n");
      else if (typeof parsed === "object" && parsed !== null) {
        text = Object.entries(parsed)
          .filter(([, v]) => v !== null && v !== undefined)
          .map(([k, v]) => `${k}: ${typeof v === "string" ? v : String(v)}`)
          .join("\n");
      } else {
        text = String(parsed);
      }
      return { previewText: text };
    } catch {
      return { previewText: buffer.toString("utf-8") };
    }
  }

  return { previewText: buffer.toString("utf-8") };
}

async function convertPdfToPng(buffer: Buffer): Promise<Buffer[]> {
  const pages: PngPageOutput[] = await pdfToPng(buffer, {
    returnPageContent: true,
    returnMetadataOnly: false,
    verbosityLevel: VerbosityLevel.ERRORS,
    viewportScale: 1.0,
    // Limit pages to avoid extremely long processing times on large PDFs.
    // Most user documents are well under this; the first 10 pages capture
    // the key content for interview context.
    pagesToProcess: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  });

  return pages
    .filter((p) => p.kind === "content" && p.content)
    .map((p) => p.content as Buffer);
}
