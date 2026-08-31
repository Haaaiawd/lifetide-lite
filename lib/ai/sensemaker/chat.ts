// Sensemaker bounded chat — explains, compares, refines and reflects without choosing for the user.
// See .loom/design/insight-plan-contracts.md § Bounded chat contract

import { z } from "zod";
import { generateStructured } from "@/lib/ai/client";
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
      return "用户想理解或感受某条路线。可以解释依据，也可以按用户要求生成一段明确标为想象的未来试映；不能替用户做决定或推荐路线。";
    case "compare_tradeoff":
      return "用户想比较不同路线的取舍。你必须呈现多条路线的区别和各自的得失，但不排名、不推荐。";
    case "refine_trial":
      return "用户想调整某条路线的三天试验。你只能建议低成本、可逆的小改动，不能安排不可逆或高成本动作。";
    case "reflect_on_trial":
      return "用户想复盘已经尝试过的三天试验。你只能基于用户自己报告的事实进行讨论，不能编造试验结果。";
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

function buildPrompt(input: {
  scope: ChatScope;
  message: string;
  plan: FinalPlan;
  memorySummary: string;
  recentMessages: { role: "user" | "assistant"; text: string }[];
  turnsRemaining: number;
  localNotes: string[];
}): string {
  return [
    `任务：围绕已经生成的三条平行人生，完成解释依据、比较取舍、缩小试验或复盘现实反馈。直接回应用户真正问的内容，每次只推进一个有价值的区别或动作。`,
    ``,
    `<APPLICATION_STATE trusted="true">`,
    `当前对话范围：${input.scope}`,
    scopeInstruction(input.scope),
    `剩余轮次：${input.turnsRemaining}`,
    `计划（地位平等）：${buildPlanSummary(input.plan)}`,
    `记忆摘要：${input.memorySummary}`,
    input.localNotes.length > 0
      ? `对话中已有的临时笔记：\n${input.localNotes.map((n) => `- ${n}`).join("\n")}\n`
      : "",
    `近期对话：${JSON.stringify(input.recentMessages)}`,
    `</APPLICATION_STATE>`,
    ``,
    `<USER_MESSAGE trusted="false">${JSON.stringify(input.message)}</USER_MESSAGE>`,
    ``,
    `对话纪律：`,
    `- 不排名、不推荐、不替用户选择；不修改 WorkingMemory 或计划，不执行外部动作，不提供诊断或高后果专业结论。`,
    `- 先回答，不强制每句使用“你之前提到”。只有引用记忆事实时才列 exact evidence id；没有依据就说明是推演。`,
    `- 可以提出一个锋利判断，但必须让用户容易不同意或修正。最多 500 tokens。`,
    `- 当用户想“感受一下这条路”，可生成一个短试映镜头：普通星期二、糟糕的一天、岔路时刻、90 天语音便签、只换一个变量或现实约束碰撞。`,
    `- 试映必须标注“想象试映”，已知部分来自计划/证据，补足部分不得变成事实；至少包含一个普通摩擦，不虚构他人的具体反应；结尾只问一个靠近/后退或能量/阻力问题。`,
    `- local_note 只记录本线程里一个可能有用的新观察（≤80字）；会改变计划的新事实应邀请短复访谈。`,
    `- offer_reinterview 只在用户明确想重新回答/访谈时为 true；close_thread 只在用户明确结束或达到轮次上限时为 true。`,
    `- 越界时用一句边界说明，再给一个仍可支持的方向。`,
  ].join("\n");
}

function safeOutput(
  text: string,
  options: { offer_reinterview?: boolean; close_thread?: boolean } = {}
): z.infer<typeof sensemakerChatOutputSchema> {
  return {
    schema_version: "sensemaker.chat.output.v1",
    response: text,
    cited_evidence_ids: [],
    local_note: undefined,
    offer_reinterview: options.offer_reinterview ?? false,
    close_thread: options.close_thread ?? false,
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
    case "compare_tradeoff":
      return `${routeNames} 的区别主要在于生活节奏和身份来源。例如，第一条路线保留当前方向但做局部优化，第二条路线复用能力但换一个相邻角色，第三条路线暂时放下惯性身份去探索。`;
    case "refine_trial":
      return `如果想把「${plan.lives[0].title}」的三天试验做得更小，可以从"${plan.lives[0].trial.today_action}"开始，观察自己接下几天的能量变化。`;
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
      prompt_version: PROMPT_VERSION,
      fixture: () =>
        Promise.resolve({
          schema_version: "sensemaker.chat.output.v1",
          response: fixtureResponse(scope, plan, message),
          cited_evidence_ids: [],
          local_note: undefined,
          offer_reinterview: false,
          close_thread: nextThread.turns_used >= 20,
        }),
    });
  } catch (err) {
    console.error("Sensemaker chat failed, using fallback:", err instanceof Error ? err.message : "unknown");
    output = safeOutput("我暂时无法生成回复。你可以换个方式问，或者稍后再试。");
  }

  const activeEvidenceIds = new Set(
    memory.evidence.filter((item) => item.status === "active").map((item) => item.id)
  );
  const userRequestedReinterview = /重新(回答|访谈)|再访谈|重做访谈/.test(message);
  const userRequestedClose = /^(结束|不用继续|先到这里|就这样吧|停止)$/.test(message.trim());
  output = {
    ...output,
    cited_evidence_ids: output.cited_evidence_ids.filter((id) => activeEvidenceIds.has(id)),
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
