import { pdfToPng, VerbosityLevel, type PngPageOutput } from "pdf-to-png-converter";
import mammoth from "mammoth";
import { extractTextFromImageBase64, MAX_PAGES } from "@/lib/ai/vision";

export type ExtractionResult = {
  previewText: string;
  pageImages: string[];
};

function toDataUrl(mime: string, buffer: Buffer): string {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

export async function extractFromBuffer(
  buffer: Buffer,
  mime: string,
  parser: "text" | "markdown" | "json" | "pdf" | "docx" | "image"
): Promise<ExtractionResult> {
  if (parser === "image") {
    const dataUrl = toDataUrl(mime, buffer);
    const result = await extractTextFromImageBase64([dataUrl]);
    return { previewText: result.text, pageImages: [dataUrl] };
  }

  if (parser === "pdf") {
    const pngs = await convertPdfToPng(buffer);
    const dataUrls = pngs.map((b) => toDataUrl("image/png", b));
    const result = await extractTextFromImageBase64(dataUrls);
    return { previewText: result.text, pageImages: dataUrls };
  }

  if (parser === "docx") {
    const raw = await mammoth.extractRawText({ buffer });
    return { previewText: raw.value, pageImages: [] };
  }

  if (parser === "json") {
    try {
      const parsed = JSON.parse(buffer.toString("utf-8"));
      let text: string;
      if (typeof parsed === "string") text = parsed;
      else if (Array.isArray(parsed)) text = parsed.map(String).join("\n");
      else if (typeof parsed === "object" && parsed !== null) {
        text = Object.entries(parsed).map(([k, v]) => `${k}: ${String(v)}`).join("\n");
      } else {
        text = String(parsed);
      }
      return { previewText: text, pageImages: [] };
    } catch {
      return { previewText: buffer.toString("utf-8"), pageImages: [] };
    }
  }

  return { previewText: buffer.toString("utf-8"), pageImages: [] };
}

async function convertPdfToPng(buffer: Buffer): Promise<Buffer[]> {
  const pages: PngPageOutput[] = await pdfToPng(buffer, {
    pagesToProcess: Array.from({ length: MAX_PAGES }, (_, i) => i + 1),
    returnPageContent: true,
    returnMetadataOnly: false,
    verbosityLevel: VerbosityLevel.ERRORS,
    viewportScale: 1.5,
  });

  return pages
    .filter((p) => p.kind === "content" && p.content)
    .slice(0, MAX_PAGES)
    .map((p) => p.content as Buffer);
}
