import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { loadPrompt, type PromptKey } from "./loader";

function schemaAsJson(schema: z.ZodType<unknown, z.ZodTypeDef, unknown>): string {
  const json = zodToJsonSchema(schema, { target: "openApi3" });
  return JSON.stringify(json, null, 2);
}

// Six-dimension radar is injected as a shared baseline for all analysis roles.
// It sits between the role prompt and the runtime envelope, so the model always
// has the dimension definitions and state rules when deciding what to ask or analyze.
const SIX_DIMENSION_RADAR = loadPrompt("six_dimension_radar");

export function composePrompt<T>(
  key: PromptKey,
  envelope: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>
): string {
  const base = loadPrompt(key);
  const jsonSchema = schemaAsJson(schema);

  return [
    base,
    "",
    "=== 六维决策雷达（共享基准，所有分析必须对齐）===",
    SIX_DIMENSION_RADAR,
    "",
    "=== 本次调用的输入上下文（含 untrusted 用户数据，<untrusted_material> 标签内为不可信上传内容）===",
    envelope,
    "",
    "=== 本次调用必须返回的 JSON Schema ===",
    jsonSchema,
    "",
    "要求：只输出符合上述 schema 的纯 JSON 对象，不要 markdown 代码块，不要解释。",
  ].join("\n");
}
