import { generateText } from "ai";
import { createVisionModel } from "@/lib/ai/client";
import { loadPrompt } from "@/lib/ai/prompts/loader";

export const MAX_PAGES = 5;

export type ExtractedTextResult = {
  text: string;
  pageCount: number;
};

type MessagePart =
  | { type: "text"; text: string }
  | { type: "file"; mediaType: "image"; data: string };

export async function extractTextFromImageBase64(
  imageBase64: string[],
  options?: { signal?: AbortSignal }
): Promise<ExtractedTextResult> {
  const pages = imageBase64.slice(0, MAX_PAGES);
  const model = createVisionModel();
  const prompt = loadPrompt("multimodal_extract");

  const content: MessagePart[] = [
    { type: "text", text: prompt },
    ...pages.map((b64) => ({
      type: "file" as const,
      mediaType: "image" as const,
      data: b64,
    })),
  ];

  const result = await generateText({
    model,
    messages: [{ role: "user", content }],
    maxOutputTokens: 2048,
    temperature: 0,
    abortSignal: options?.signal,
  });

  return { text: result.text.trim(), pageCount: pages.length };
}
