// Deterministic uncertainty selection. The host still picks one active
// uncertainty to satisfy the response schema and fallback, but with full
// memory transmission the interviewer is no longer constrained by it.
// See .loom/design/adaptive-interview-system.md §2

import type { Uncertainty, WorkingMemory } from "@/lib/working-memory/types";
import { recomputeUncertaintyPriority } from "@/lib/working-memory/types";

export const MAX_ACTIVE_UNCERTAINTIES = 8;

export type RankedUncertainties = {
  sorted: Uncertainty[];
  selectedId: string | null;
};

export function rankActiveUncertainties(memory: WorkingMemory): RankedUncertainties {
  const active = memory.uncertainties
    .filter((u) => u.status === "active")
    .slice(0, MAX_ACTIVE_UNCERTAINTIES)
    .map((u) => ({ ...u, priority: recomputeUncertaintyPriority(u.factors) }));

  active.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (a.created_wave !== b.created_wave) return a.created_wave - b.created_wave;
    return a.id.localeCompare(b.id);
  });

  return {
    sorted: active,
    selectedId: active[0]?.id ?? null,
  };
}

export function selectedUncertainty(memory: WorkingMemory): Uncertainty | null {
  return rankActiveUncertainties(memory).sorted[0] ?? null;
}
