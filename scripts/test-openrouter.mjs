import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

process.loadEnvFile(".env");

const provider = process.env.AI_PROVIDER ?? "openrouter";
let apiKey;
let baseURL;
let model;
let fetchPatch;

if (provider === "aiping") {
  apiKey = process.env.AIPING_API_KEY;
  baseURL = process.env.AIPING_BASE_URL ?? "https://aiping.cn/api/v1";
  model = process.env.AIPING_MODEL ?? "Qwen3.7-Plus";
  const baseFetch = globalThis.fetch;
  fetchPatch = async (input, init) => {
    if (init?.body && typeof init.body === "string" && input.toString().includes("aiping.cn")) {
      try {
        const parsed = JSON.parse(init.body);
        parsed.enable_thinking = false;
        init = { ...init, body: JSON.stringify(parsed) };
      } catch {}
    }
    return baseFetch(input, init);
  };
} else {
  apiKey = process.env.OPENROUTER_API_KEY;
  baseURL = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
  model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
}

if (!apiKey) {
  console.error(`${provider} API key not set`);
  process.exit(1);
}

const openai = createOpenAI({
  apiKey,
  baseURL,
  headers: provider === "openrouter" ? { "HTTP-Referer": "http://localhost:3000", "X-Title": "Lifetide-Lite" } : undefined,
  fetch: fetchPatch,
});

const schema = z.object({
  reply: z.string(),
  mood: z.enum(["positive", "neutral", "negative"]),
});

try {
  const { object } = await generateObject({
    model: openai.chat(model),
    schema,
    prompt: "用中文回答：如果一个人在三年内想换方向但不确定，应该先从哪一小步开始？请只输出 JSON。",
  });
  console.log("OK", object);
} catch (err) {
  console.error("FAIL", err);
  process.exit(1);
}
