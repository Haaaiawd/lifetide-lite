import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";

export const aiProviderSchema = z.enum(["aiping", "openrouter", "fixture"]);

export type AIProvider = z.infer<typeof aiProviderSchema>;

export type ProviderConfig = {
  provider: AIProvider;
  apiKey?: string;
  baseURL?: string;
  model: string;
};

export function getProviderConfig(): ProviderConfig {
  const parsed = aiProviderSchema.safeParse(process.env.AI_PROVIDER);
  const provider = parsed.success ? parsed.data : "aiping";

  if (provider === "openrouter") {
    return {
      provider,
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
      model: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
    };
  }

  if (provider === "fixture") {
    return {
      provider: "fixture",
      model: process.env.FIXTURE_MODEL_ID ?? "fixture",
    };
  }

  return {
    provider: "aiping",
    apiKey: process.env.AIPING_API_KEY,
    baseURL: process.env.AIPING_BASE_URL ?? "https://aiping.cn/api/v1",
    model: process.env.AIPING_MODEL ?? "Qwen3.7-Plus",
  };
}

function createAipingFetch(): typeof fetch {
  const baseFetch = globalThis.fetch;
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    if (!url.includes("aiping.cn") || !init?.body || typeof init.body !== "string") {
      return baseFetch(input, init);
    }
    try {
      const parsed = JSON.parse(init.body);
      parsed.enable_thinking = false;
      return baseFetch(input, { ...init, body: JSON.stringify(parsed) });
    } catch {
      return baseFetch(input, init);
    }
  };
}

export function createLanguageModel(config?: ProviderConfig) {
  const c = config ?? getProviderConfig();
  if (c.provider === "fixture") {
    throw new Error("Fixture provider is selected but no fixture response supplied. Use generateStructuredFixture or set AI_PROVIDER=aiping/openrouter.");
  }

  const openai = createOpenAI({
    apiKey: c.apiKey,
    baseURL: c.baseURL,
    headers: c.provider === "openrouter" ? {
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
      "X-Title": "Lifetide-Lite",
    } : undefined,
    fetch: c.provider === "aiping" ? createAipingFetch() : undefined,
  });

  return openai.chat(c.model);
}

export type GenerateStructuredOptions<T> = {
  purpose: string;
  wave_id?: string;
  session_id?: string;
  prompt: string;
  schema: z.ZodType<T>;
  max_tokens?: number;
  timeout_ms?: number;
  temperature?: number;
  seed?: number;
  prompt_version?: string;
  fixture?: () => T | Promise<T>;
};

export type ModelCallRecord = {
  sessionId?: string;
  wave_id?: string;
  purpose: string;
  model_config_id: string;
  prompt_version: string;
  status: "success" | "error" | "fallback";
  input_tokens?: number;
  output_tokens?: number;
  latency_ms?: number;
};

export async function logModelCall(record: ModelCallRecord) {
  try {
    await prisma.modelCallLog.create({ data: record });
  } catch {
    // Audit logging must not break the user flow.
  }
}

export async function generateStructured<T>(options: GenerateStructuredOptions<T>): Promise<T> {
  const start = Date.now();
  const config = getProviderConfig();
  const promptVersion = options.prompt_version ?? "v0-draft";

  if (config.provider === "fixture") {
    if (!options.fixture) {
      throw new Error("Fixture provider selected but no fixture callback provided.");
    }
    const object = await options.fixture();
    const parsed = options.schema.parse(object);
    await logModelCall({
      sessionId: options.session_id,
      wave_id: options.wave_id,
      purpose: options.purpose,
      model_config_id: "fixture/fixture",
      prompt_version: promptVersion,
      status: "success",
      input_tokens: 0,
      output_tokens: 0,
      latency_ms: 0,
    });
    return parsed as T;
  }

  const model = createLanguageModel(config);
  const timeoutMs = options.timeout_ms ?? 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { object, usage } = await generateObject({
      model,
      schema: options.schema,
      prompt: options.prompt,
      maxTokens: options.max_tokens,
      temperature: options.temperature ?? 0,
      seed: options.seed ?? 42,
      abortSignal: controller.signal,
    });
    clearTimeout(timeoutId);

    const latency = Date.now() - start;
    await logModelCall({
      sessionId: options.session_id,
      wave_id: options.wave_id,
      purpose: options.purpose,
      model_config_id: `${config.provider}/${config.model}`,
      prompt_version: promptVersion,
      status: "success",
      input_tokens: usage?.inputTokens,
      output_tokens: usage?.outputTokens,
      latency_ms: latency,
    });

    return object as T;
  } catch (err) {
    clearTimeout(timeoutId);
    await logModelCall({
      sessionId: options.session_id,
      wave_id: options.wave_id,
      purpose: options.purpose,
      model_config_id: `${config.provider}/${config.model}`,
      prompt_version: promptVersion,
      status: "error",
      latency_ms: Date.now() - start,
    });
    throw err;
  }
}
