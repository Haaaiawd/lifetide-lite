import { generateText } from "ai";
import { createVisionModel } from "@/lib/ai/client";
import { loadPrompt } from "@/lib/ai/prompts/loader";

// No artificial page limit — send all pages, batched for parallel OCR.
// Batch size 5 balances parallelism vs per-request token load:
// too small = more requests but each still slow; too large = one giant request.
const OCR_BATCH_SIZE = 5;

export type ExtractedTextResult = {
  text: string;
  pageCount: number;
};

type MessagePart =
  | { type: "text"; text: string }
  | { type: "file"; mediaType: "image"; data: string };

async function ocrBatch(
  batch: string[],
  model: ReturnType<typeof createVisionModel>,
  prompt: string,
  options?: { signal?: AbortSignal }
): Promise<string> {
  const content: MessagePart[] = [
    { type: "text", text: prompt },
    ...batch.map((b64) => ({
      type: "file" as const,
      mediaType: "image" as const,
      data: b64,
    })),
  ];

  const result = await generateText({
    model,
    messages: [{ role: "user", content }],
    maxOutputTokens: 4096,
    temperature: 0,
    abortSignal: options?.signal,
  });

  return result.text.trim();
}

export async function extractTextFromImageBase64(
  imageBase64: string[],
  options?: { signal?: AbortSignal }
): Promise<ExtractedTextResult> {
  const pages = imageBase64;
  if (pages.length === 0) {
    return { text: "", pageCount: 0 };
  }

  const model = createVisionModel();
  const prompt = loadPrompt("multimodal_extract");

  // Split into batches and run in parallel
  const batches: string[][] = [];
  for (let i = 0; i < pages.length; i += OCR_BATCH_SIZE) {
    batches.push(pages.slice(i, i + OCR_BATCH_SIZE));
  }

  const results = await Promise.all(
    batches.map((batch) => ocrBatch(batch, model, prompt, options))
  );

  const text = results.filter(Boolean).join("\n\n---\n\n");
  return { text, pageCount: pages.length };
}
