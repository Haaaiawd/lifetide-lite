import { randomUUID } from "node:crypto";
import {
  type WorkingMemory,
  type MemoryOperation,
  type EvidenceNote,
  type Claim,
  type Constraint,
  type RouteSeed,
  type Uncertainty,
  recomputeUncertaintyPriority,
  type InsightFeedback,
  type SourceRef,
} from "./types";

function newId() {
  return randomUUID();
}

function allIds(memory: WorkingMemory): Set<string> {
  const ids = new Set<string>();
  for (const item of memory.evidence) ids.add(item.id);
  for (const item of memory.claims) ids.add(item.id);
  for (const item of memory.constraints) ids.add(item.id);
  for (const item of memory.route_seeds) ids.add(item.id);
  for (const item of memory.uncertainties) ids.add(item.id);
  return ids;
}

function allocateId(memory: WorkingMemory, temp_id?: string): string {
  const id = temp_id ?? newId();
  if (allIds(memory).has(id)) {
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

export function applyMemoryOperations(
  memory: WorkingMemory,
  operations: MemoryOperation[],
  options: { wave_id?: string; created_at?: string } = {}
): WorkingMemory {
  const next: WorkingMemory = JSON.parse(JSON.stringify(memory));
  const waveId = options.wave_id ?? `w${next.last_wave_index + 1}`;
  const createdAt = options.created_at ?? new Date().toISOString();

  for (const operation of operations) {
    switch (operation.op) {
      case "add_evidence": {
        const item = operation.item;
        const id = allocateId(next, item.temp_id);
        const evidence: EvidenceNote = {
          id,
          statement: item.statement,
          source_refs: item.source_refs,
          epistemic: item.epistemic,
          relevance: item.relevance,
          confidence: item.confidence,
          status: item.status,
          invalidated_by: item.invalidated_by,
        };
        next.evidence.push(evidence);
        break;
      }

      case "invalidate_evidence": {
        const evidence = findOrFail(next.evidence, operation.evidence_id);
        if (evidence.status !== "active") {
          throw new Error(`Evidence ${operation.evidence_id} is not active and cannot be invalidated`);
        }
        evidence.status = "invalidated";
        evidence.invalidated_by = operation.by;
        // Any claim that used this evidence as its only active evidence becomes invalidated.
        for (const claim of next.claims) {
          if (claim.status === "active") {
            const activeEvidence = claim.evidence_ids.filter((eid) =>
              next.evidence.some((e) => e.id === eid && e.status === "active")
            );
            if (activeEvidence.length === 0) {
              claim.status = "invalidated";
              claim.correction_note = claim.correction_note ?? "Evidence no longer active";
            }
          }
        }
        break;
      }

      case "upsert_claim": {
        const item = operation.item;
        const evidenceIds = item.evidence_ids;
        for (const eid of evidenceIds) {
          findOrFail(next.evidence, eid);
        }

        if (operation.target_id) {
          const claim = findOrFail(next.claims, operation.target_id);
          claim.text = item.text;
          claim.evidence_ids = evidenceIds as [string, ...string[]];
          claim.confidence = item.confidence;
          claim.status = item.status;
          claim.correction_note = item.correction_note;
        } else {
          const id = allocateId(next, item.temp_id);
          const claim: Claim = {
            id,
            text: item.text,
            evidence_ids: evidenceIds as [string, ...string[]],
            confidence: item.confidence,
            status: item.status,
            correction_note: item.correction_note,
          };
          next.claims.push(claim);
        }
        break;
      }

      case "invalidate_claim": {
        const claim = findOrFail(next.claims, operation.claim_id);
        if (claim.status !== "active") {
          throw new Error(`Claim ${operation.claim_id} is not active and cannot be invalidated`);
        }
        claim.status = "invalidated";
        claim.correction_note = operation.correction_note;
        break;
      }

      case "upsert_constraint": {
        const item = operation.item;
        const evidenceIds = item.evidence_ids;
        for (const eid of evidenceIds) findOrFail(next.evidence, eid);

        if (operation.target_id) {
          const constraint = findOrFail(next.constraints, operation.target_id);
          constraint.text = item.text;
          constraint.kind = item.kind;
          constraint.flexibility = item.flexibility;
          constraint.evidence_ids = evidenceIds as [string, ...string[]];
          constraint.status = item.status;
        } else {
          const id = allocateId(next, item.temp_id);
          const constraint: Constraint = {
            id,
            text: item.text,
            kind: item.kind,
            flexibility: item.flexibility,
            evidence_ids: evidenceIds as [string, ...string[]],
            status: item.status,
          };
          next.constraints.push(constraint);
        }
        break;
      }

      case "upsert_route_seed": {
        const item = operation.item;
        for (const eid of item.appeal_evidence_ids) findOrFail(next.evidence, eid);
        for (const eid of item.feasibility_evidence_ids) findOrFail(next.evidence, eid);

        if (operation.target_id) {
          const seed = findOrFail(next.route_seeds, operation.target_id);
          seed.title_hint = item.title_hint;
          seed.life_shape = item.life_shape;
          seed.distinct_on = item.distinct_on;
          seed.appeal_evidence_ids = item.appeal_evidence_ids;
          seed.feasibility_evidence_ids = item.feasibility_evidence_ids;
          seed.uncertainty_ids = item.uncertainty_ids;
          seed.status = item.status;
        } else {
          const id = allocateId(next, item.temp_id);
          const seed: RouteSeed = {
            id,
            title_hint: item.title_hint,
            life_shape: item.life_shape,
            distinct_on: item.distinct_on,
            appeal_evidence_ids: item.appeal_evidence_ids,
            feasibility_evidence_ids: item.feasibility_evidence_ids,
            uncertainty_ids: item.uncertainty_ids,
            status: item.status,
          };
          next.route_seeds.push(seed);
        }
        break;
      }

      case "upsert_uncertainty": {
        const item = operation.item;
        const priority = recomputeUncertaintyPriority(item.factors);
        for (const eid of item.related_evidence_ids) findOrFail(next.evidence, eid);

        if (operation.target_id) {
          const uncertainty = findOrFail(next.uncertainties, operation.target_id);
          uncertainty.question = item.question;
          uncertainty.plan_consequence = item.plan_consequence;
          uncertainty.related_evidence_ids = item.related_evidence_ids;
          uncertainty.related_route_seed_ids = item.related_route_seed_ids;
          uncertainty.factors = item.factors;
          uncertainty.priority = priority;
          uncertainty.created_wave = item.created_wave;
          uncertainty.status = item.status;
          uncertainty.resolution_evidence_ids = item.resolution_evidence_ids;
        } else {
          const id = allocateId(next, item.temp_id);
          const uncertainty: Uncertainty = {
            id,
            question: item.question,
            plan_consequence: item.plan_consequence,
            related_evidence_ids: item.related_evidence_ids,
            related_route_seed_ids: item.related_route_seed_ids,
            factors: item.factors,
            priority,
            created_wave: item.created_wave,
            status: item.status,
            resolution_evidence_ids: item.resolution_evidence_ids,
          };
          next.uncertainties.push(uncertainty);
        }
        break;
      }

      case "resolve_uncertainty": {
        const uncertainty = findOrFail(next.uncertainties, operation.uncertainty_id);
        if (uncertainty.status !== "active") {
          throw new Error(`Uncertainty ${operation.uncertainty_id} is not active and cannot be resolved`);
        }
        for (const eid of operation.resolution_evidence_ids) findOrFail(next.evidence, eid);
        uncertainty.status = "resolved";
        uncertainty.resolution_evidence_ids = operation.resolution_evidence_ids;
        break;
      }
    }
  }

  // Enforce limits as defensive guards. Keep the most recent items by array order.
  // Wave 1 will not hit these, but they protect against runaway patches.
  next.evidence = next.evidence.slice(-24);
  next.claims = next.claims.slice(-10);
  next.constraints = next.constraints.slice(-6);
  next.route_seeds = next.route_seeds.slice(-6);
  next.uncertainties = next.uncertainties.slice(-8);
  next.recent_feedback = next.recent_feedback.slice(-4);

  next.revision += 1;
  next.last_wave_index = Math.max(next.last_wave_index, parseWaveIndex(waveId));
  next.updated_at = createdAt;
  return next;
}

function parseWaveIndex(waveId: string): number {
  const match = /^w(\d+)$/.exec(waveId);
  return match ? Number(match[1]) : 0;
}

export function applyInsightFeedback(
  memory: WorkingMemory,
  feedback: InsightFeedback
): { memory: WorkingMemory; invalidated: string[] } {
  const next: WorkingMemory = JSON.parse(JSON.stringify(memory));
  next.recent_feedback.push(feedback);

  const invalidated: string[] = [];

  if (feedback.verdict === "inaccurate") {
    // Invalidate claims whose evidence is from the same wave and not otherwise confirmed.
    for (const claim of next.claims) {
      if (claim.status !== "active") continue;
      const hasThisWaveOnly = claim.evidence_ids.some((eid) => {
        const evidence = next.evidence.find((e) => e.id === eid);
        if (!evidence) return false;
        return evidence.source_refs.some(
          (ref) => ref.kind === "answer" && ref.wave_id === feedback.wave_id
        );
      });
      if (hasThisWaveOnly) {
        claim.status = "invalidated";
        claim.correction_note = feedback.correction ?? "User marked the insight as inaccurate";
        invalidated.push(claim.id);
      }
    }
  } else if (feedback.verdict === "partly_accurate") {
    // Downgrade confidence of claims from this wave where user added a correction.
    if (feedback.correction) {
      for (const claim of next.claims) {
        if (claim.status !== "active") continue;
        const hasThisWaveOnly = claim.evidence_ids.some((eid) => {
          const evidence = next.evidence.find((e) => e.id === eid);
          if (!evidence) return false;
          return evidence.source_refs.some(
            (ref) => ref.kind === "answer" && ref.wave_id === feedback.wave_id
          );
        });
        if (hasThisWaveOnly && claim.confidence === "high") {
          claim.confidence = "medium";
        }
      }
    }
  }

  // Store the feedback itself as a source for future evidence.
  const feedbackSource: SourceRef = {
    kind: "insight_feedback",
    feedback_id: feedback.id,
    wave_id: feedback.wave_id,
  };

  if (feedback.correction && feedback.verdict !== "accurate") {
    next.evidence.push({
      id: newId(),
      statement: feedback.correction,
      source_refs: [feedbackSource],
      epistemic: "user_confirmed",
      relevance: ["direction"],
      confidence: "high",
      status: "active",
    });
  }

  next.revision += 1;
  next.updated_at = new Date().toISOString();
  return { memory: next, invalidated };
}
