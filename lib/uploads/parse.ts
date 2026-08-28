export type ParsedChunk = {
  index: number;
  source: "paragraph" | "heading" | "line";
  text: string;
};

const MAX_CHUNK_CHARS = 1200;

function splitIntoChunks(text: string): ParsedChunk[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: ParsedChunk[] = [];
  let idx = 0;

  for (const para of paragraphs) {
    if (para.length <= MAX_CHUNK_CHARS) {
      chunks.push({ index: idx++, source: "paragraph", text: para });
      continue;
    }

    // Break very long paragraphs by sentence-ish boundaries.
    const sentences = para.match(/[^.!?。！？\n]+[.!?。！？\n]+|[^.!?。！？\n]+$/g) ?? [para];
    let buffer = "";
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;
      if (buffer.length + trimmed.length + 1 > MAX_CHUNK_CHARS) {
        chunks.push({ index: idx++, source: "line", text: buffer.trim() });
        buffer = trimmed;
      } else {
        buffer = buffer ? `${buffer} ${trimmed}` : trimmed;
      }
    }
    if (buffer) {
      chunks.push({ index: idx++, source: "line", text: buffer.trim() });
    }
  }

  return chunks;
}

function extractTextFromJson(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed === "string") return [parsed];
    if (Array.isArray(parsed)) return parsed.map((item) => String(item));
    if (typeof parsed === "object" && parsed !== null) {
      return Object.entries(parsed).map(([k, v]) => `${k}: ${String(v)}`);
    }
    return [String(parsed)];
  } catch {
    return [json];
  }
}

export function parseUploadContent(raw: string, parser: "text" | "markdown" | "json"): ParsedChunk[] {
  if (parser === "json") {
    const texts = extractTextFromJson(raw);
    return texts
      .map((text, i) => ({ index: i, source: "paragraph" as const, text: text.trim() }))
      .filter((c) => c.text.length > 0);
  }

  if (parser === "markdown") {
    // Split on headings first; if no headings, fall back to paragraphs.
    const headingPattern = /^(#{1,6}\s+.+)$/m;
    const hasHeadings = headingPattern.test(raw);
    if (hasHeadings) {
      const parts = raw.split(headingPattern).filter(Boolean);
      const chunks: ParsedChunk[] = [];
      let idx = 0;
      let currentHeading: string | undefined;
      for (const part of parts) {
        if (/^#{1,6}\s+/.test(part)) {
          currentHeading = part.replace(/^#{1,6}\s+/, "").trim();
          chunks.push({ index: idx++, source: "heading", text: currentHeading });
        } else {
          const body = part.trim();
          if (body) {
            chunks.push({ index: idx++, source: "paragraph", text: body });
          }
        }
      }
      return chunks.filter((c) => c.text.length > 0);
    }
  }

  return splitIntoChunks(raw);
}
