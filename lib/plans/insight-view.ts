import type { ImmediateInsight, InsightView, WorkingMemory } from "@/lib/working-memory/types";

export function toInsightView(
  insight: ImmediateInsight,
  wave: number,
  memory?: WorkingMemory | null
): InsightView {
  const evidence = insight.evidence_ids.map((id) => {
    const note = memory?.evidence.find((e) => e.id === id);
    return note ? `${note.statement.slice(0, 40)}` : id.slice(0, 8);
  });

  return {
    wave,
    facts: [insight.observation],
    evidence,
    interpretation: insight.interpretation,
    uncertainty: insight.uncertainty,
  };
}
