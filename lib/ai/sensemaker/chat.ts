// Sensemaker bounded chat — explains, compares, refines and reflects without choosing for the user.
// See .loom/design/insight-plan-contracts.md § Bounded chat contract

import { z } from "zod";
import { generateStructured } from "@/lib/ai/client";
import { composePrompt } from "@/lib/ai/prompts/compose";
import { buildChatMessage } from "@/lib/chat/store";
import { buildMemorySummary } from "@/lib/chat/summary";
import { sensemakerChatOutputSchema } from "@/lib/working-memory/schema";
import type { BoundedChatThread, ChatScope, FinalPlan, WorkingMemory } from "@/lib/working-memory/types";

const PROMPT_VERSION = "sensemaker.chat.v3";

const OUT_OF_SCOPE_FIXTURE =
  "这个请求超出了当前对话能支持的范围。有界对话只用于：解释理解/计划、比较取舍、调整三天试验、复盘试验结果。如果你愿意，可以重新做一次访谈，或在设置中导出数据。";

const CRISIS_BOUNDARY_FIXTURE =
  "你提到的内容让我想先确认你的安全。人生试运行不是危机干预或专业支持服务。如果你现在处于危险中，请联系当地紧急服务或身边可信任的人。如果你愿意，我们可以先暂停规划，聊一聊你此刻最需要什么。";

export type RunChatResult = {
  userMessageId: string;
  assistantMessageId: string;
  output: z.infer<typeof sensemakerChatOutputSchema>;
  nextThread: BoundedChatThread;
};

export type RunChatOptions = {
  crisisDetected?: boolean;
  outOfScope?: boolean;
};

function scopeInstruction(scope: ChatScope): string {
  switch (scope) {
    case "explain":
      return "Point to the actual exact SourceRef and distinguish what it supports from what remains inference.";
    case "compare":
      return "Compare dimensions the user names or the plan already contains. Do not compute a winner or invent weights.";
    case "adjust":
      return "Reduce friction, cost or risk while preserving the learning hypothesis.";
    case "blueprint":
      return "Produce a concrete, time-bounded next action the user can start today.";
    case "reflect_on_trial":
      return "Use only feedback the user reports. Separate signal about the route from signal about this particular prototype/context.";
    default:
      return "Stay within the requested scope and do not mutate memory or plan.";
  }
}

function buildPlanSummary(plan: FinalPlan): string {
  return plan.lives
    .map(
      (life, i) =>
        `路线 ${i + 1}：${life.title}\n- 核心体验：${life.core_experience}\n- 第1年：${life.year_1}\n- 第2年：${life.year_2}\n- 第3年：${life.year_3}\n- 普通一天：${life.ordinary_day}\n- 吸引力：${life.attractions.join("；")}\n- 代价：${life.costs_and_tradeoffs.join("；")}\n- 不确定：${life.uncertainties.join("；")}\n- 风险：${life.risks.join("；")}\n- 三天试验：${life.trial.hypothesis}`
    )
    .join("\n\n");
}

function buildChatEnvelope(input: {
  scope: ChatScope;
  message: string;
  plan: FinalPlan;
  memorySummary: string;
  recentMessages: { role: "user" | "assistant"; text: string }[];
  turnsRemaining: number;
  localNotes: string[];
}): string {
  return [
    `scope: ${input.scope}`,
    `scope_instruction: ${scopeInstruction(input.scope)}`,
    `turns_remaining: ${input.turnsRemaining}`,
    `max_response_tokens: 500`,
    "",
    "=== 计划（地位平等）===",
    buildPlanSummary(input.plan),
    "",
    "=== 记忆摘要 ===",
    input.memorySummary,
    "",
    input.localNotes.length > 0
      ? `=== 对话中已有的临时笔记 ===\n${input.localNotes.map((n) => `- ${n}`).join("\n")}\n`
      : "",
    "=== 近期对话 ===",
    JSON.stringify(input.recentMessages),
    "",
    "=== 用户消息 ===",
    JSON.stringify(input.message),
    "",
    "注意：本次调用处于 v3 prompt 的过渡阶段。请只输出符合下面 schema 的 SensemakerChatOutput，不要输出其他格式。",
  ].join("\n");
}

function buildPrompt(input: Parameters<typeof buildChatEnvelope>[0]): string {
  return composePrompt<z.infer<typeof sensemakerChatOutputSchema>>(
    "sensemaker_chat",
    buildChatEnvelope(input),
    sensemakerChatOutputSchema as z.ZodType<z.infer<typeof sensemakerChatOutputSchema>, z.ZodTypeDef, unknown>
  );
}

function safeOutput(
  text: string,
  options: { offer_reinterview?: boolean; close_thread?: boolean } = {}
): z.infer<typeof sensemakerChatOutputSchema> {
  return {
    schema_version: "sensemaker.chat.output.v3",
    scope: "explain",
    response: text,
    cited_evidence_ids: [],
    local_note: undefined,
    offer_reinterview: options.offer_reinterview ?? false,
    close_thread: options.close_thread ?? false,
    suggested_blueprint: false,
  };
}

function fixtureResponse(scope: ChatScope, plan: FinalPlan, message: string): string {
  const routeNames = plan.lives.map((l) => l.title).join("、");
  switch (scope) {
    case "explain":
      if (/模拟|试映|普通(一)?天|星期二|糟糕的一天|90\s*天/.test(message)) {
        return `想象试映｜普通星期二：早上，你按「${plan.lives[0].title}」的节奏开始一天；白天推进${plan.lives[0].year_1}，中间也会遇到${plan.lives[0].costs_and_tradeoffs[0]}这类普通摩擦。晚上你回看今天，最值得观察的是：这段生活让你更靠近，还是更想后退？`;
      }
      return `我会用你之前提到的内容来解释。以「${plan.lives[0].title}」为例，它的核心是${plan.lives[0].core_experience}，第一年主要是${plan.lives[0].year_1}。`;
    case "compare":
      return `${routeNames} 的区别主要在于生活节奏和身份来源。例如，第一条路线保留当前方向但做局部优化，第二条路线复用能力但换一个相邻角色，第三条路线暂时放下惯性身份去探索。`;
    case "adjust":
      return `如果想把「${plan.lives[0].title}」的三天试验做得更小，可以从"${plan.lives[0].trial.today_action}"开始，观察自己接下几天的能量变化。`;
    case "blueprint":
      return `今天可以做的最小动作是："${plan.lives[0].trial.today_action}"。留意一天结束后的能量变化。`;
    case "reflect_on_trial":
      return "试玩三天之后，最重要的是回答三个问题：实际发生了什么？和预期有什么不同？下一步想继续验证、暂停还是换线？";
    default:
      return "我听到了。我们可以继续围绕这三条路线讨论。";
  }
}

export async function runSensemakerChat(
  sessionId: string,
  thread: BoundedChatThread,
  message: string,
  scope: ChatScope,
  plan: FinalPlan,
  memory: WorkingMemory,
  options: RunChatOptions = {}
): Promise<RunChatResult> {
  if (thread.turns_used >= 20 || thread.status !== "active") {
    const reason = thread.turns_used >= 20 ? "达到 20 轮上限" : "对话已经结束";
    return {
      userMessageId: "",
      assistantMessageId: "",
      output: safeOutput(`这个对话已经${reason}。想继续可以重新开始访谈。`, { close_thread: true }),
      nextThread: { ...thread, status: thread.turns_used >= 20 ? "closed_limit" : thread.status },
    };
  }

  if (options.crisisDetected) {
    return {
      userMessageId: "",
      assistantMessageId: "",
      output: safeOutput(CRISIS_BOUNDARY_FIXTURE),
      nextThread: { ...thread, status: "closed_safety" },
    };
  }

  if (options.outOfScope) {
    const userMessage = buildChatMessage("user", message);
    const next: BoundedChatThread = {
      ...thread,
      messages: [...thread.messages, userMessage],
    };
    return {
      userMessageId: userMessage.id,
      assistantMessageId: "",
      output: safeOutput(OUT_OF_SCOPE_FIXTURE),
      nextThread: next,
    };
  }

  const userMessage = buildChatMessage("user", message, { scope });
  const nextThread = {
    ...thread,
    messages: [...thread.messages, userMessage],
    turns_used: thread.turns_used + 1,
  };

  const recentMessages = nextThread.messages.slice(-6).map((m) => ({ role: m.role, text: m.text }));
  const memorySummary = buildMemorySummary(memory, 4000);

  const prompt = buildPrompt({
    scope,
    message,
    plan,
    memorySummary,
    recentMessages,
    turnsRemaining: 20 - nextThread.turns_used,
    localNotes: thread.local_notes,
  });

  let output: z.infer<typeof sensemakerChatOutputSchema>;

  try {
    output = await generateStructured({
      purpose: "sensemaker_chat",
      session_id: sessionId,
      prompt,
      schema: sensemakerChatOutputSchema,
      max_tokens: 1200,
      timeout_ms: 60000,
      prompt_version: PROMPT_VERSION,
      fixture: () =>
        Promise.resolve({
          schema_version: "sensemaker.chat.output.v3",
          scope,
          response: fixtureResponse(scope, plan, message),
          cited_evidence_ids: [],
          local_note: undefined,
          offer_reinterview: false,
          close_thread: nextThread.turns_used >= 20,
          suggested_blueprint: false,
        } as z.infer<typeof sensemakerChatOutputSchema>),
    });
  } catch (err) {
    console.error("Sensemaker chat failed, using fallback:", err instanceof Error ? err.message : "unknown");
    output = safeOutput("我暂时无法生成回复。你可以换个方式问，或者稍后再试。");
  }

  const activeHeads = new Set(
    memory.source_heads.filter((h) => h.status === "active").map((h) => h.source_id)
  );
  const userRequestedReinterview = /重新(回答|访谈)|再访谈|重做访谈/.test(message);
  const userRequestedClose = /^(结束|不用继续|先到这里|就这样吧|停止)$/.test(message.trim());
  output = {
    ...output,
    cited_evidence_ids: output.cited_evidence_ids.filter((id) => activeHeads.has(id)),
    offer_reinterview: userRequestedReinterview,
    close_thread: userRequestedClose || nextThread.turns_used >= 20,
  };

  const assistantMessage = buildChatMessage("assistant", output.response, {
    cited_evidence_ids: output.cited_evidence_ids,
    local_note: output.local_note,
  });

  const finalThread: BoundedChatThread = {
    ...nextThread,
    messages: [...nextThread.messages, assistantMessage],
    local_notes: output.local_note
      ? [...nextThread.local_notes.slice(-7), output.local_note].slice(-8)
      : nextThread.local_notes,
    status: output.close_thread || nextThread.turns_used >= 20 ? "closed_limit" : "active",
  };

  return {
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
    output,
    nextThread: finalThread,
  };
}
