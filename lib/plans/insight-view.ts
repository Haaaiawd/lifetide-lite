import type { ImmediateInsight, InsightView, WorkingMemory } from "@/lib/working-memory/types";

export function toInsightView(
  insight: ImmediateInsight,
  wave: number,
  memory?: WorkingMemory | null
): InsightView {
  const activeHeads = new Set(
    memory?.source_heads.filter((h) => h.status === "active").map((h) => h.source_id) ?? []
  );
  const evidence = insight.evidence
    .filter((link) => activeHeads.has(link.source_id))
    .slice(0, 5)
    .map((link) => link.excerpt?.slice(0, 40) ?? link.source_id.slice(0, 8));

  return {
    wave,
    facts: [insight.user_told_me],
    evidence,
    interpretation: insight.current_reading,
    uncertainty: insight.important_unknown,
  };
}
