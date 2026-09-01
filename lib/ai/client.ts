import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamObject, Output } from "ai";
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

export type MultimodalConfig = {
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

function createAipingFetch(enableThinking = false): typeof fetch {
  const baseFetch = globalThis.fetch;
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    if (!url.includes("aiping.cn") || !init?.body || typeof init.body !== "string") {
      return baseFetch(input, init);
    }
    try {
      const parsed = JSON.parse(init.body);
      if (!enableThinking) {
        // Qwen3 hybrid thinking: disable via top-level field (Node.js SDK style)
        parsed.enable_thinking = false;
        // Some OpenAI-compatible endpoints require it inside chat_template_kwargs
        parsed.chat_template_kwargs = { ...(parsed.chat_template_kwargs ?? {}), enable_thinking: false };
        // Also inject /no_think into the last user message as a prompt-level override.
        // This is the most reliable method per Qwen docs — works even if the API
        // ignores the parameter fields.
        if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
          const last = parsed.messages[parsed.messages.length - 1];
          if (last && typeof last.content === "string" && !last.content.includes("/no_think")) {
            last.content = last.content + "\n\n/no_think";
          }
        }
      }
      if (parsed.temperature === 0) delete parsed.temperature;
      if (parsed.seed === 42) delete parsed.seed;
      const t0 = Date.now();
      const res = await baseFetch(input, { ...init, body: JSON.stringify(parsed) });
      const elapsed = Date.now() - t0;
      console.log(`[AIPING] ${parsed.model} ${res.status} ${elapsed}ms tokens=${parsed.max_tokens}`);
      if (!res.ok) {
        const clone = res.clone();
        const text = await clone.text().catch(() => "");
        console.error("[AIPING RESPONSE]", res.status, text.slice(0, 500));
      }
      return res;
    } catch {
      return baseFetch(input, init);
    }
  };
}

export function getMultimodalConfig(): MultimodalConfig {
  const base = getProviderConfig();
  return {
    provider: base.provider,
    apiKey: base.apiKey,
    baseURL: base.baseURL,
    model: process.env.MULTIMODAL_MODEL ?? (base.provider === "aiping" ? "Qwen3.5-Flash" : base.model),
  };
}

export function createLanguageModel(config?: ProviderConfig, enableThinking = false) {
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
    fetch: c.provider === "aiping" ? createAipingFetch(enableThinking) : undefined,
  });

  return openai.chat(c.model);
}

export function createVisionModel(config?: MultimodalConfig) {
  const c = config ?? getMultimodalConfig();
  if (c.provider === "fixture") {
    throw new Error("Fixture provider does not support vision extraction.");
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
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  max_tokens?: number;
  timeout_ms?: number;
  max_retries?: number;
  temperature?: number;
  seed?: number;
  prompt_version?: string;
  fixture?: () => T | Promise<T>;
  // When true, the aiping fetch wrapper will NOT inject /no_think,
  // allowing Qwen3 hybrid thinking to run. Default false.
  enableThinking?: boolean;
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
    const jsonPrompt = options.prompt.includes("输出 JSON")
      ? options.prompt
      : `${options.prompt}\n\n请只输出符合上述要求的 JSON，不要添加解释。`;
    const { text, usage } = await generateText({
      model,
      prompt: jsonPrompt,
      maxOutputTokens: options.max_tokens,
      maxRetries: options.max_retries ?? 2,
      temperature: options.temperature ?? 0,
      output: Output.json(),
      abortSignal: controller.signal,
    });
    clearTimeout(timeoutId);

    console.log(`[AI RESPONSE] purpose=${options.purpose} textLen=${text?.length ?? 0} preview=${text?.slice(0, 300) ?? "(empty)"}`);

    const raw = JSON.parse(text);
    const parsed = options.schema.parse(raw);

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

    return parsed as T;
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

/**
 * Streaming version of generateStructured.
 * Calls onPartial with partially parsed JSON as tokens arrive.
 * Returns the final parsed object.
 */
export async function streamStructured<T>(
  options: GenerateStructuredOptions<T> & {
    onPartial?: (partial: Partial<T>) => void;
  }
): Promise<T> {
  const start = Date.now();
  const config = getProviderConfig();
  const promptVersion = options.prompt_version ?? "v0-draft";

  if (config.provider === "fixture") {
    if (!options.fixture) {
      throw new Error("Fixture provider selected but no fixture callback provided.");
    }
    const object = await options.fixture();
    const parsed = options.schema.parse(object);
    options.onPartial?.(parsed);
    await logModelCall({
      sessionId: options.session_id,
      wave_id: options.wave_id,
      purpose: options.purpose,
      model_config_id: "fixture/fixture",
      prompt_version: promptVersion,
      status: "success",
      latency_ms: 0,
    });
    return parsed as T;
  }

  const model = createLanguageModel(config, options.enableThinking);
  const timeoutMs = options.timeout_ms ?? 120000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const jsonPrompt = options.prompt.includes("输出 JSON")
      ? options.prompt
      : `${options.prompt}\n\n请只输出符合上述要求的 JSON，不要添加解释。`;

    const result = streamObject({
      model,
      prompt: jsonPrompt,
      maxOutputTokens: options.max_tokens,
      maxRetries: options.max_retries ?? 2,
      temperature: options.temperature ?? 0,
      schema: options.schema,
      abortSignal: controller.signal,
    });

    // Consume partial outputs
    for await (const partial of result.partialObjectStream) {
      if (partial && typeof partial === "object") {
        options.onPartial?.(partial as Partial<T>);
      }
    }

    clearTimeout(timeoutId);

    const finalObject = await result.object;
    console.log(`[AI STREAM] purpose=${options.purpose} objectKeys=${Object.keys(finalObject ?? {}).join(",")}`);

    const parsed = finalObject as T;

    const latency = Date.now() - start;
    const usage = await result.usage;
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

    return parsed as T;
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
