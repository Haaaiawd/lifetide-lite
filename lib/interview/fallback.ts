import type { InterviewQuestion, Uncertainty } from "@/lib/working-memory/types";

// Fallback questions when the Interviewer model call fails or is skipped.
// These questions use the uncertainty's `topic` (a statement) as background
// context in `why_this_matters`, but NEVER embed the topic into the question
// text itself. The question text is always a short, generic, human-readable
// prompt that works regardless of the topic's length or shape.
//
// Option ids include the wave index to avoid collisions across waves.
export function defaultFallbackQuestions(
  wave_id: string,
  wave_index: number,
  uncertainty: Uncertainty
): InterviewQuestion[] {
  const w = `w${wave_index}`;
  const q = (
    order: number,
    text: string,
    concrete: boolean,
    response_kind: InterviewQuestion["response_kind"],
    options?: InterviewQuestion["options"],
    allows_custom?: boolean
  ): InterviewQuestion => ({
    id: `${w}q${order}`,
    wave_id,
    order,
    text,
    // topic is a statement ("我暂不知晓的是……"); use it as context, not as question text.
    why_this_matters: `这能帮我们理解一个关键未知：${uncertainty.topic}`,
    response_kind,
    options,
    allows_custom,
    sensitivity: "normal",
    allows_skip: true,
    asks_for_concrete_example: concrete,
  });

  return [
    q(
      1,
      "最近有没有一个具体的时刻，让你对当前的方向感受最深？当时最主要的状态是？",
      true,
      "multi_choice",
      [
        { id: `${w}q1-a`, label: "有投入感" },
        { id: `${w}q1-b`, label: "在被消耗" },
        { id: `${w}q1-c`, label: "犹豫不前" },
        { id: `${w}q1-d`, label: "想逃避" },
      ],
      true
    ),
    q(2, "如果用一句话描述那个时刻，发生了什么？", true, "short_text"),
    q(
      3,
      "这个未知对你未来三年可能带来的不同影响，哪一个你更想先排除？",
      false,
      "single_choice",
      [
        { id: `${w}q3-a`, label: "失去现在的稳定" },
        { id: `${w}q3-b`, label: "错过更适合自己的方向" },
        { id: `${w}q3-c`, label: "让自己更疲惫" },
        { id: `${w}q3-d`, label: "身边人无法理解" },
      ],
      true
    ),
    q(4, "在那段经历里，什么让你觉得值得继续？什么让你想放弃？", true, "short_text"),
    q(
      5,
      "如果可以重新选择，你更希望当时的情况更接近哪种？",
      false,
      "single_choice",
      [
        { id: `${w}q5-a`, label: "有更多自主空间" },
        { id: `${w}q5-b`, label: "有更明确的方向" },
        { id: `${w}q5-c`, label: "有更稳定的环境" },
        { id: `${w}q5-d`, label: "有更紧密的关系" },
      ],
      true
    ),
    q(6, "最近有没有另一件事让你产生类似的感受？如果有，是什么？", true, "short_text"),
  ];
}
