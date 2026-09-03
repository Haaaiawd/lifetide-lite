import mammoth from "mammoth";
import { extractTextFromImageBase64 } from "@/lib/ai/vision";

export type ExtractionResult = {
  previewText: string;
  // "ok" = text extracted successfully
  // "pdf_no_text" = PDF has no text layer (scanned/image), user should paste text manually
  status?: "ok" | "pdf_no_text";
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
    // If we got any meaningful text (at least 20 chars), use it.
    // Only truly empty/scanned PDFs fall back to the manual-paste path.
    return fullText.length >= 20 ? fullText : null;
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
    // Fast path: extract text layer directly with pdfjs (near-instant).
    // Works for text-based PDFs (papers, resumes, reports).
    const t0 = Date.now();
    const textLayer = await extractPdfTextLayer(buffer);
    const t1 = Date.now();
    console.log(`[Upload] PDF text layer: ${((t1 - t0) / 1000).toFixed(2)}s, len=${textLayer?.length ?? 0}`);
    if (textLayer) {
      return { previewText: textLayer, status: "ok" };
    }
    // No text layer — this is a scanned/image PDF.
    // Don't do slow OCR; ask the user to paste text from an external OCR tool.
    return {
      previewText: "",
      status: "pdf_no_text",
    };
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
