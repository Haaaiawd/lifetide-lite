import type { WorkingMemory } from "@/lib/working-memory/types";

export function buildMemorySummary(memory: WorkingMemory, maxChars = 4000): string {
  const claims = memory.claims
    .filter((c) => c.status === "active")
    .map((c) => `- ${c.text}`)
    .join("\n");

  const constraints = memory.constraints
    .filter((c) => c.status === "active")
    .map((c) => `- ${c.text}`)
    .join("\n");

  const activeHeads = new Set(
    memory.source_heads
      .filter((h) => h.status === "active")
      .map((h) => h.source_id)
  );
  const evidence = memory.source_versions
    .filter((sv) => activeHeads.has(sv.source_id))
    .slice(0, 12)
    .map((sv) => `- [${sv.kind}] ${sv.text_ref}`)
    .join("\n");

  const uncertainties = memory.uncertainties
    .filter((u) => u.status === "active")
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6)
    .map((u) => `- ${u.question}`)
    .join("\n");

  const summary = [
    `记忆版本: ${memory.revision}`,
    ``,
    `当前理解:`,
    claims || "（暂无）",
    ``,
    `约束:`,
    constraints || "（暂无）",
    ``,
    `关键证据:`,
    evidence || "（暂无）",
    ``,
    `未解决问题（按优先级）:`,
    uncertainties || "（暂无）",
  ].join("\n");

  if (summary.length > maxChars) {
    return summary.slice(0, maxChars) + "\n…（已截断）";
  }
  return summary;
}
