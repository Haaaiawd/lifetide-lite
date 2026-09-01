import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROMPT_DIR = join(process.cwd(), "prompts");

const promptFiles = {
  interviewer: "interviewer-v2.md",
  sensemaker_wave: "sensemaker-wave-v2.md",
  sensemaker_futures: "odyssey-generator-v2.md",
  portrait: "persona-portrait-v1.md",
  prototype_designer: "prototype-designer-v2.md",
  blueprint_writer: "blueprint-writer-v2.md",
  sensemaker_chat: "sensemaker-chat-v3.md",
  multimodal_extract: "multimodal-extract-v1.md",
  six_dimension_radar: "six-dimension-radar-v1.md",
  architecture: "PROMPT-ARCHITECTURE.md",
} as const;

export type PromptKey = keyof typeof promptFiles;

export function loadPrompt(key: PromptKey): string {
  const file = promptFiles[key];
  const path = join(PROMPT_DIR, file);
  try {
    return readFileSync(path, "utf-8").trim();
  } catch (err) {
    throw new Error(`Failed to load prompt "${key}" from ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function listPrompts(): PromptKey[] {
  return Object.keys(promptFiles) as PromptKey[];
}
