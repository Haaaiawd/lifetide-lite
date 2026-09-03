import type { InterviewQuestion, Uncertainty } from "@/lib/working-memory/types";

export function defaultFallbackQuestions(
  wave_id: string,
  wave_index: number,
  uncertainty: Uncertainty
): InterviewQuestion[] {
  const q = (
    order: number,
    text: string,
    concrete: boolean,
    response_kind: InterviewQuestion["response_kind"],
    options?: InterviewQuestion["options"],
    allows_custom?: boolean
  ): InterviewQuestion => ({
    id: `w${wave_index}q${order}`,
    wave_id,
    order,
    text,
    why_this_matters: `这能帮我们理解：${uncertainty.question}`,
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
      `回想一个最近让你想到"${uncertainty.question}"的具体时刻，当时最主要的状态是？`,
      true,
      "multi_choice",
      [
        { id: "w2q1-a", label: "有投入感" },
        { id: "w2q1-b", label: "在被消耗" },
        { id: "w2q1-c", label: "犹豫不前" },
        { id: "w2q1-d", label: "想逃避" },
      ],
      true
    ),
    q(2, `如果用一句话描述那个时刻，发生了什么？`, true, "short_text"),
    q(
      3,
      `这个未知对你未来三年可能带来的不同影响，哪一个你更想先排除？`,
      false,
      "single_choice",
      [
        { id: "w2q3-a", label: "失去现在的稳定" },
        { id: "w2q3-b", label: "错过更适合自己的方向" },
        { id: "w2q3-c", label: "让自己更疲惫" },
        { id: "w2q3-d", label: "身边人无法理解" },
      ],
      true
    ),
    q(4, `在那段经历里，什么让你觉得值得继续？什么让你想放弃？`, true, "short_text"),
    q(
      5,
      `如果可以重新选择，你更希望当时的情况更接近哪种？`,
      false,
      "single_choice",
      [
        { id: "w2q5-a", label: "有更多自主空间" },
        { id: "w2q5-b", label: "有更明确的方向" },
        { id: "w2q5-c", label: "有更稳定的环境" },
        { id: "w2q5-d", label: "有更紧密的关系" },
      ],
      true
    ),
    q(6, `最近有没有另一件事让你产生类似的感受？如果有，是什么？`, true, "short_text"),
  ];
}
