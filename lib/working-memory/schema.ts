import { z } from "zod";

const idSchema = z.string().min(1);

const confidenceSchema = z.enum(["low", "medium", "high"]);
const statusSchema = z.enum(["active", "invalidated", "resolved"]);
const supportStatusSchema = z.enum(["supported", "unsupported", "stale"]);

const responseKindSchema = z.enum(["short_text", "single_choice", "multi_choice", "scale"]);
const sensitivitySchema = z.enum(["normal", "sensitive"]);

const sourceRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("answer"), answer_id: idSchema, question_id: idSchema, wave_id: idSchema }),
  z.object({ kind: z.literal("insight_feedback"), feedback_id: idSchema, wave_id: idSchema }),
  z.object({ kind: z.literal("user_correction"), correction_id: idSchema, wave_id: idSchema }),
  z.object({ kind: z.literal("upload_chunk"), document_id: idSchema, chunk_id: idSchema }),
  z.object({ kind: z.literal("chat_note"), thread_id: idSchema, message_id: idSchema }),
]);

const interviewQuestionSchema = z.object({
  id: idSchema,
  wave_id: idSchema,
  order: z.number().int(),
  text: z.string().min(1),
  why_this_matters: z.string().optional(),
  response_kind: responseKindSchema,
  options: z.array(z.object({ id: idSchema, label: z.string().min(1) })).optional(),
  allows_custom: z.boolean().optional(),
  sensitivity: sensitivitySchema,
  allows_skip: z.literal(true),
  asks_for_concrete_example: z.boolean(),
});

const uploadChunkSchema = z.object({
  document_id: idSchema,
  chunk_id: idSchema,
  ordinal: z.number().int(),
  text: z.string(),
  content_hash: z.string(),
  trust: z.literal("untrusted_user_data"),
  injection_pattern_detected: z.boolean(),
});

const interviewAnswerSchema = z.object({
  id: idSchema,
  question_id: idSchema,
  wave_id: idSchema,
  value: z.union([z.string(), z.array(z.string()), z.number()]).optional(),
  skipped: z.boolean(),
  correction: z.string().optional(),
  submitted_at: z.string().min(1),
});

const evidenceNoteSchema = z.object({
  id: idSchema,
  statement: z.string().min(1),
  source_refs: z.array(sourceRefSchema).min(1),
  epistemic: z.enum(["user_confirmed", "user_reported", "reported_in_document", "model_inference"]),
  relevance: z.array(z.enum(["direction", "energy", "constraint", "route", "risk"])),
  confidence: confidenceSchema,
  status: statusSchema,
  invalidated_by: sourceRefSchema.optional(),
});

const claimSchema = z.object({
  id: idSchema,
  text: z.string().min(1),
  evidence_ids: z.array(idSchema).min(1),
  confidence: confidenceSchema,
  status: statusSchema,
  correction_note: z.string().optional(),
});

const constraintKindSchema = z.enum([
  "time",
  "money",
  "health",
  "care",
  "location",
  "relationship",
  "legal",
  "other",
]);

const constraintSchema = z.object({
  id: idSchema,
  text: z.string().min(1),
  kind: constraintKindSchema,
  flexibility: z.enum(["fixed_now", "negotiable", "unknown"]),
  evidence_ids: z.array(idSchema).min(1),
  status: statusSchema,
});

const routeSeedSchema = z.object({
  id: idSchema,
  title_hint: z.string().min(1),
  life_shape: z.string().min(1),
  distinct_on: z.string().min(1),
  appeal_evidence_ids: z.array(idSchema),
  feasibility_evidence_ids: z.array(idSchema),
  uncertainty_ids: z.array(idSchema),
  status: statusSchema,
});

const uncertaintyFactorsSchema = z.object({
  plan_impact: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  evidence_gap: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  user_salience: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  reversibility_value: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  sensitivity_cost: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  repetition_cost: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
});

const uncertaintySchema = z.object({
  id: idSchema,
  question: z.string().min(1),
  plan_consequence: z.string().min(1),
  related_evidence_ids: z.array(idSchema),
  related_route_seed_ids: z.array(idSchema),
  factors: uncertaintyFactorsSchema,
  priority: z.number(),
  created_wave: z.number().int(),
  status: z.enum(["active", "resolved", "declined"]),
  resolution_evidence_ids: z.array(idSchema).optional(),
});

const insightVerdictSchema = z.enum(["accurate", "partly_accurate", "inaccurate"]);

const insightFeedbackSchema = z.object({
  id: idSchema,
  wave_id: idSchema,
  verdict: insightVerdictSchema,
  correction: z.string().optional(),
  next_interest: z.string().optional(),
  created_at: z.string().min(1),
});

export const workingMemorySchema = z
  .object({
    schema_version: z.literal("wm.v1"),
    session_id: idSchema,
    revision: z.number().int(),
    evidence: z.array(evidenceNoteSchema),
    claims: z.array(claimSchema),
    constraints: z.array(constraintSchema),
    route_seeds: z.array(routeSeedSchema),
    uncertainties: z.array(uncertaintySchema),
    recent_feedback: z.array(insightFeedbackSchema),
    last_wave_index: z.number().int(),
    updated_at: z.string().min(1),
  })
  .strict();

export const immediateInsightSchema = z
  .object({
    observation: z.string().min(1),
    interpretation: z.string().min(1),
    uncertainty: z.string().min(1),
    evidence_ids: z.array(idSchema).min(1),
    confidence: confidenceSchema,
    kind: z.enum(["pattern", "tension", "constraint", "possibility"]),
    feedback_prompt: z.string().min(1),
  })
  .strict();

export const interviewerOutputSchema = z
  .object({
    schema_version: z.literal("interviewer.output.v1"),
    focus_uncertainty_id: idSchema,
    focus_reason: z.string().min(1),
    questions: z.array(interviewQuestionSchema),
  })
  .strict();

export const sensemakerWaveOutputSchema = z
  .object({
    schema_version: z.literal("sensemaker.wave.output.v1"),
    expected_revision: z.number().int(),
    operations: z.array(
      z.discriminatedUnion("op", [
        z.object({ op: z.literal("add_evidence"), item: z.any() }),
        z.object({ op: z.literal("invalidate_evidence"), evidence_id: idSchema, by: sourceRefSchema }),
        z.object({ op: z.literal("upsert_claim"), target_id: idSchema.optional(), item: z.any() }),
        z.object({ op: z.literal("invalidate_claim"), claim_id: idSchema, correction_note: z.string() }),
        z.object({ op: z.literal("upsert_constraint"), target_id: idSchema.optional(), item: z.any() }),
        z.object({ op: z.literal("upsert_route_seed"), target_id: idSchema.optional(), item: z.any() }),
        z.object({ op: z.literal("upsert_uncertainty"), target_id: idSchema.optional(), item: z.any() }),
        z.object({ op: z.literal("resolve_uncertainty"), uncertainty_id: idSchema, resolution_evidence_ids: z.array(idSchema) }),
      ])
    ),
    insight: immediateInsightSchema,
  })
  .strict();

export const chatScopeSchema = z.enum(["explain", "compare_tradeoff", "refine_trial", "reflect_on_trial"]);

export const chatMessageSchema = z.object({
  id: idSchema,
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(1500),
  scope: chatScopeSchema.optional(),
  cited_evidence_ids: z.array(idSchema).optional(),
  local_note: z.string().max(160).optional(),
  created_at: z.string().min(1),
});

export const boundedChatThreadSchema = z.object({
  id: idSchema,
  session_id: idSchema,
  final_plan_revision: z.number().int().min(0),
  turns_used: z.number().int().min(0).max(20),
  status: z.enum(["active", "closed_limit", "closed_user", "closed_safety"]),
  local_notes: z.array(z.string().max(160)).max(8),
  messages: z.array(chatMessageSchema).max(41),
});

const recentMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(1500),
});

export const sensemakerChatInputSchema = z.object({
  schema_version: z.literal("sensemaker.chat.input.v1"),
  scope: chatScopeSchema,
  message: z.string().min(1).max(1500),
  plan: z.any(),
  memory_summary: z.string().max(6000),
  recent_messages: z.array(recentMessageSchema).max(6),
  turns_remaining: z.number().int().min(0).max(20),
  prompt_version: z.string().min(1),
});

const rawSensemakerChatOutputSchema = z.object({
  schema_version: z.literal("sensemaker.chat.output.v1").optional(),
  response: z.string().min(1).max(2000).optional(),
  answer: z.string().min(1).max(2000).optional(),
  reply: z.string().min(1).max(2000).optional(),
  cited_evidence_ids: z.array(z.string().max(64)).max(5).default([]),
  local_note: z.string().max(160).nullable().optional(),
  offer_reinterview: z.boolean().default(false),
  close_thread: z.boolean().default(false),
});

export const sensemakerChatOutputSchema = rawSensemakerChatOutputSchema
  .transform((data) => ({
    schema_version: data.schema_version ?? "sensemaker.chat.output.v1",
    response: data.response ?? data.answer ?? data.reply ?? "",
    cited_evidence_ids: data.cited_evidence_ids,
    local_note: data.local_note ?? undefined,
    offer_reinterview: data.offer_reinterview,
    close_thread: data.close_thread,
  }))
  .refine((data) => data.response.length > 0, "chat output must include response, answer or reply");

export type WorkingMemoryFromSchema = z.infer<typeof workingMemorySchema>;
