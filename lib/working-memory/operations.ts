import { randomUUID } from "node:crypto";
import type {
  WorkingMemory,
  MemoryOperation,
  InsightFeedback,
  EvidenceLink,
  RadarCell,
  Claim,
  Constraint,
  RouteIntent,
  SourceRef,
} from "@/lib/working-memory/types";

function newId() {
  return randomUUID();
}

function allocateId(memory: WorkingMemory, temp_id?: string): string {
  const id = temp_id ?? newId();
  const all = new Set<string>([
    ...memory.claims.map((c) => c.id),
    ...memory.constraints.map((c) => c.id),
    ...memory.route_intents.map((r) => r.id),
    ...memory.uncertainties.map((u) => u.id),
  ]);
  if (all.has(id)) {
    throw new Error(`Proposed id ${id} already exists in WorkingMemory`);
  }
  return id;
}

function findOrFail<T extends { id: string }>(arr: T[], id: string): T {
  const item = arr.find((x) => x.id === id);
  if (!item) throw new Error(`Referenced id not found in WorkingMemory: ${id}`);
  return item;
}

function active<T extends { status: string }>(arr: T[]): T[] {
  return arr.filter((x) => x.status === "active");
}

function sourceRefForAnswer(answerId: string): SourceRef {
  return { source_id: answerId, source_revision: 1 };
}

function evidenceFromSourceRef(
  ref: SourceRef,
  reason: string,
  epistemicStatus: EvidenceLink["epistemic_status"] = "working_inference",
  evidenceShape: EvidenceLink["evidence_shape"] = "concrete_scene"
): EvidenceLink {
  return {
    source_id: ref.source_id,
    source_revision: ref.source_revision,
    epistemic_status: epistemicStatus,
    evidence_shape: evidenceShape,
    relevance: reason,
    excerpt: undefined,
  };
}

export function applyMemoryOperations(
  memory: WorkingMemory,
  operations: MemoryOperation[],
  options: {
    wave_id: string;
    generation_provenance_id: string;
    created_at?: string;
  }
): WorkingMemory {
  const next: WorkingMemory = JSON.parse(JSON.stringify(memory));
  const createdAt = options.created_at ?? new Date().toISOString();
  const provenanceId = options.generation_provenance_id;
  const waveIndex = parseWaveIndex(options.wave_id);

  for (const operation of operations) {
    switch (operation.op) {
      case "add_claim": {
        const value = operation.value;
        const id = allocateId(next);
        const claim: Claim = {
          ...value,
          id,
          generation_provenance_id: provenanceId,
          status: "active",
          calibration: "unreviewed",
        };
        next.claims.push(claim);
        break;
      }

      case "supersede_claim": {
        const value = operation.value;
        const prior = findOrFail(next.claims, operation.prior_id);
        const id = allocateId(next);
        const claim: Claim = {
          ...value,
          id,
          generation_provenance_id: provenanceId,
          status: "active",
          calibration: "unreviewed",
        };
        prior.status = "superseded";
        prior.superseded_by_id = id;
        next.claims.push(claim);
        break;
      }

      case "invalidate_claim": {
        const claim = findOrFail(next.claims, operation.id);
        if (claim.status !== "active") {
          throw new Error(`Claim ${operation.id} is not active and cannot be invalidated`);
        }
        claim.status = "invalidated";
        break;
      }

      case "add_constraint": {
        const value = operation.value;
        const id = allocateId(next);
        const constraint: Constraint = {
          ...value,
          id,
          generation_provenance_id: provenanceId,
          status: "active",
        };
        next.constraints.push(constraint);
        break;
      }

      case "add_route_intent_seed": {
        const value = operation.value;
        const id = allocateId(next);
        const intent: RouteIntent = {
          ...value,
          id,
          generation_provenance_id: provenanceId,
          status: "seed",
        };
        next.route_intents.push(intent);
        break;
      }

      case "update_radar": {
        const value = operation.value;
        const cell = next.radar[value.dimension];
        if (!cell) break;

        // Validate source refs point to active source versions.
        for (const ref of value.source_refs) {
          const head = next.source_heads.find((h) => h.source_id === ref.source_id);
          if (!head || head.status !== "active" || head.active_revision !== ref.source_revision) {
            throw new Error(
              `Radar update references unknown or inactive source ${ref.source_id}@${ref.source_revision}`
            );
          }
        }

        const evidence = value.source_refs.map((ref) =>
          evidenceFromSourceRef(ref, value.reason, "working_inference", "concrete_scene")
        );

        next.radar[value.dimension] = {
          dimension: value.dimension,
          state: value.to,
          reason: value.reason,
          evidence: [...cell.evidence, ...evidence].slice(-8),
          updated_at: createdAt,
        };
        break;
      }

      case "mark_stale": {
        for (const id of operation.ids) {
          const claim = next.claims.find((c) => c.id === id);
          if (claim && claim.status === "active") {
            claim.status = "stale";
            continue;
          }
          const constraint = next.constraints.find((c) => c.id === id);
          if (constraint && constraint.status === "active") {
            constraint.status = "stale";
            continue;
          }
          const routeIntent = next.route_intents.find((r) => r.id === id);
          if (routeIntent) {
            routeIntent.status = "rejected";
            continue;
          }
          const radarCell = Object.values(next.radar).find(
            (c) => c.dimension === id
          );
          if (radarCell) {
            // Marking a radar dimension stale: reset to unseen with reason.
            radarCell.state = "unseen";
            radarCell.reason = `Marked stale by source ${operation.source_ref.source_id}`;
            radarCell.updated_at = createdAt;
          }
        }
        break;
      }
    }
  }

  // Defensive limits.
  next.claims = next.claims.slice(-16);
  next.constraints = next.constraints.slice(-10);
  next.route_intents = next.route_intents.slice(-8);
  next.uncertainties = next.uncertainties.slice(-12);
  next.recent_feedback = next.recent_feedback.slice(-8);

  next.revision += 1;
  next.last_wave_index = Math.max(next.last_wave_index, waveIndex);
  next.updated_at = createdAt;
  return next;
}

function parseWaveIndex(waveId: string): number {
  const match = /^w(\d+)$/.exec(waveId);
  return match ? Number(match[1]) : 0;
}

export function applyInsightFeedback(
  memory: WorkingMemory,
  feedback: InsightFeedback,
  waveProvenanceIds?: Set<string>
): { memory: WorkingMemory; invalidated: string[] } {
  const next: WorkingMemory = JSON.parse(JSON.stringify(memory));
  next.recent_feedback.push(feedback);
  next.corrections.push(feedback.id);

  const invalidated: string[] = [];

  // A claim belongs to this wave if its generation_provenance_id is in the
  // waveProvenanceIds set, or if any of its evidence source_ids contain the wave_id.
  const belongsToWave = (claim: typeof next.claims[number]): boolean => {
    if (waveProvenanceIds && waveProvenanceIds.has(claim.generation_provenance_id)) {
      return true;
    }
    return claim.evidence.some(
      (link) => link.source_id.startsWith(`${feedback.wave_id}-`) || link.source_id.includes(feedback.wave_id)
    );
  };

  if (feedback.verdict === "inaccurate") {
    for (const claim of next.claims) {
      if (claim.status !== "active") continue;
      if (belongsToWave(claim)) {
        claim.status = "invalidated";
        invalidated.push(claim.id);
      }
    }
  } else if (feedback.verdict === "partly_accurate") {
    for (const claim of next.claims) {
      if (claim.status !== "active") continue;
      if (belongsToWave(claim)) {
        claim.calibration = "partly_accurate";
      }
    }
  } else {
    for (const claim of next.claims) {
      if (claim.status !== "active") continue;
      if (belongsToWave(claim)) {
        claim.calibration = "accurate";
      }
    }
  }

  next.revision += 1;
  next.updated_at = new Date().toISOString();
  return { memory: next, invalidated };
}
