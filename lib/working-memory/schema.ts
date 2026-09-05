import { z } from "zod";
import {
  idSchema,
  revisionSchema,
  sourceRefSchema,
  evidenceLinkSchema,
  workingUnderstandingSchema,
  parallelLivesPlanSchema,
  calibrationSchema,
  waveSensemakerProposalSchema,
  immediateInsightSchema,
  interviewerProposalSchema,
  chatScopeSchema,
  questionResponseKindSchema,
  sourceVersionSchema,
} from "@/lib/state/contracts";
import { personaPortraitStoredSchema } from "@/lib/portrait/types";
import type { InterviewQuestion, ResponseKind, Sensitivity } from "@/lib/working-memory/types";

const id = idSchema;
const isoDateTime = z.string().datetime();

export const responseKindSchema = z.enum(["short_text", "single_choice", "multi_choice", "scale"]);
export const sensitivitySchema = z.enum(["normal", "sensitive"]);

export const interviewQuestionSchema = z.object({
  id: id,
  wave_id: id,
  order: z.number().int(),
  text: z.string().min(1),
  why_this_matters: z.string().optional(),
  response_kind: responseKindSchema,
  options: z.array(z.object({ id: id, label: z.string().min(1) })).optional(),
  allows_custom: z.boolean().optional(),
  sensitivity: sensitivitySchema,
  allows_skip: z.literal(true),
  asks_for_concrete_example: z.boolean(),
});

export const uploadChunkSchema = z.object({
  document_id: id,
  chunk_id: id,
  ordinal: z.number().int(),
  text: z.string(),
  content_hash: z.string(),
  trust: z.literal("untrusted_user_data"),
  injection_pattern_detected: z.boolean(),
});

export const interviewAnswerSchema = z.object({
  id: id,
  question_id: id,
  wave_id: id,
  value: z.union([z.string(), z.array(z.string()), z.number()]).optional(),
  skipped: z.boolean(),
  correction: z.string().optional(),
  submitted_at: z.string().min(1),
});

const uncertaintyFactorsSchema = z.object({
  plan_impact: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  evidence_gap: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  user_salience: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  reversibility_value: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  sensitivity_cost: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  repetition_cost: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
});

export const uncertaintySchema = z.object({
  id: id,
  question: z.string().min(1),
  topic: z.string().min(1),
  plan_consequence: z.string().min(1),
  related_evidence: z.array(evidenceLinkSchema),
  related_route_intent_ids: z.array(id),
  factors: uncertaintyFactorsSchema,
  priority: z.number(),
  created_wave: z.number().int(),
  status: z.enum(["active", "resolved", "declined"]),
  resolution: z.array(evidenceLinkSchema).optional(),
});

export const insightFeedbackSchema = calibrationSchema.extend({
  wave_id: id,
  created_at: z.string().min(1),
});

// Runtime WorkingMemory = v3 WorkingUnderstanding + host-only fields.
export const workingMemorySchema = workingUnderstandingSchema
  .extend({
    schema_version: z.literal("wm.v3"),
    last_wave_index: z.number().int().nonnegative(),
    updated_at: isoDateTime,
    uncertainties: z.array(uncertaintySchema),
    recent_feedback: z.array(insightFeedbackSchema),
    finalPlan: parallelLivesPlanSchema.optional(),
    persona_portrait: personaPortraitStoredSchema.optional(),
    streaming_insight: immediateInsightSchema.partial().optional(),
    last_insight: immediateInsightSchema.optional(),
  })
  .strict();

export const immediateInsightProposalSchema = immediateInsightSchema
  .omit({ id: true, generation_provenance_id: true, generated_at: true, status: true })
  .extend({
    status: z.literal("proposed"),
  });

export const sensemakerWaveOutputSchema = waveSensemakerProposalSchema
  .extend({
    expected_revision: revisionSchema,
  })
  .strict();

export const interviewerOutputSchema = z
  .object({
    schema_version: z.literal("interviewer.output.v3"),
    focus_uncertainty_id: id,
    focus_reason: z.string().min(1),
    questions: z.array(interviewQuestionSchema),
    proposal: interviewerProposalSchema,
  })
  .strict();

// Chat scopes: v3 contract.
export { chatScopeSchema } from "@/lib/state/contracts";

export const chatMessageSchema = z.object({
  id: id,
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(1500),
  scope: chatScopeSchema.optional(),
  cited_evidence_ids: z.array(id).optional(),
  local_note: z.string().max(160).optional(),
  created_at: z.string().min(1),
});

export const boundedChatThreadSchema = z.object({
  id: id,
  session_id: id,
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
  schema_version: z.literal("sensemaker.chat.input.v3"),
  scope: chatScopeSchema,
  message: z.string().min(1).max(1500),
  plan: z.any(),
  memory_summary: z.string().max(6000),
  recent_messages: z.array(recentMessageSchema).max(6),
  turns_remaining: z.number().int().min(0).max(20),
  prompt_version: z.string().min(1),
});

export const sensemakerChatOutputSchema = z
  .object({
    schema_version: z.literal("sensemaker.chat.output.v3").optional(),
    scope: chatScopeSchema,
    response: z.string().min(1).max(2000).optional(),
    answer: z.string().min(1).max(2000).optional(),
    reply: z.string().min(1).max(2000).optional(),
    cited_evidence_ids: z.array(z.string().max(64)).max(5).default([]),
    local_note: z.string().max(160).nullable().optional(),
    offer_reinterview: z.boolean().default(false),
    close_thread: z.boolean().default(false),
    suggested_blueprint: z.boolean().default(false),
  })
  .transform((data) => ({
    schema_version: data.schema_version ?? "sensemaker.chat.output.v3",
    scope: data.scope,
    response: data.response ?? data.answer ?? data.reply ?? "",
    cited_evidence_ids: data.cited_evidence_ids,
    local_note: data.local_note ?? undefined,
    offer_reinterview: data.offer_reinterview,
    close_thread: data.close_thread,
    suggested_blueprint: data.suggested_blueprint,
  }))
  .refine((data) => data.response.length > 0, "chat output must include response, answer or reply");

export function toRuntimeResponseKind(kind: z.infer<typeof questionResponseKindSchema>): ResponseKind {
  switch (kind) {
    case "single_choice":
    case "rank":
    case "anchored_scale":
      return "single_choice";
    case "multiple_choice":
      return "multi_choice";
    case "short_text":
    case "scene_text":
      return "short_text";
    default:
      return "short_text";
  }
}

export function toRuntimeQuestion(q: z.infer<typeof interviewQuestionSchema>): InterviewQuestion {
  return q;
}
