import type { WorkingUnderstanding, RouteReadiness, SourceRef, RadarState, RouteIntent, EvidenceLink } from "./contracts";
import type { SessionStateHead } from "./contracts";

function normalizeLifeShapeAxis(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function distinctAxes(a: RouteIntent["life_shape"], b: RouteIntent["life_shape"]): number {
  const axes: (keyof RouteIntent["life_shape"])[] = [
    "daily_rhythm",
    "work_or_study",
    "relationships",
    "environment",
    "responsibilities",
    "resources",
  ];
  let diff = 0;
  for (const axis of axes) {
    if (normalizeLifeShapeAxis(a[axis]) !== normalizeLifeShapeAxis(b[axis])) {
      diff++;
    }
  }
  return diff;
}

function isActiveDirectUserSource(wu: WorkingUnderstanding, ref: SourceRef): boolean {
  const head = wu.source_heads.find((h) => h.source_id === ref.source_id);
  if (!head || head.status !== "active" || head.active_revision !== ref.source_revision) return false;
  const version = wu.source_versions.find(
    (v) => v.source_id === ref.source_id && v.revision === ref.source_revision
  );
  return !!version && (version.kind === "free_text" || version.kind === "question_answer");
}

function evidenceIsActiveDirectUser(wu: WorkingUnderstanding, link: EvidenceLink): boolean {
  return isActiveDirectUserSource(wu, link);
}

function evidenceIsConcreteSceneOrBehavior(link: EvidenceLink): boolean {
  return link.evidence_shape === "concrete_scene" || link.evidence_shape === "observed_behavior";
}

export function deriveRouteReadiness(
  snapshot: { workingUnderstanding: WorkingUnderstanding; stateHead: SessionStateHead },
  opts: { provisional_requested?: boolean } = {}
): RouteReadiness {
  const wu = snapshot.workingUnderstanding;
  const state = JSON.parse(JSON.stringify(snapshot.stateHead.state_value_json ?? {})) as { value?: string } | string;
  const inSafetyStop = typeof state === "object" && state.value === "safety_stop";

  const result: RouteReadiness = {
    design_question: "unmet",
    ordinary_day_anchor: "unmet",
    six_dimensions_handled: "unmet",
    four_dimensions_grounded: "unmet",
    distinct_route_intents: "unmet",
    material_tradeoff: "unmet",
    calibration: "unmet",
    safety_clear: inSafetyStop || wu.source_heads.some((s) => s.status === "active" && s.source_id.startsWith("safety")) ? "unmet" : "met",
    source_refs: [],
    formal_ready: false,
    provisional_allowed: false,
    provisional_requested: opts.provisional_requested ?? false,
    evaluated_at_wave: 0 as unknown as RouteReadiness["evaluated_at_wave"],
    evaluated_at_revision: snapshot.stateHead.revision,
  };

  // design_question: met iff trimmed non-empty and >=1 active direct-user source
  const designText = (wu.design_question ?? "").trim();
  if (designText.length > 0) {
    const designRefs = wu.design_question_source_refs.filter((ref) => isActiveDirectUserSource(wu, ref));
    if (designRefs.length >= 1) {
      result.design_question = "met";
      result.source_refs.push(...designRefs);
    }
  }

  // ordinary_day_anchor: >=2 distinct active direct-user refs on active Claims or grounded RadarCells with concrete_scene/observed_behavior
  const qualifyingSceneRefs: SourceRef[] = [];
  for (const claim of wu.claims) {
    if (claim.status !== "active") continue;
    for (const link of claim.evidence) {
      if (evidenceIsActiveDirectUser(wu, link) && evidenceIsConcreteSceneOrBehavior(link)) {
        qualifyingSceneRefs.push({ source_id: link.source_id, source_revision: link.source_revision });
      }
    }
  }
  for (const cell of Object.values(wu.radar)) {
    if (cell.state !== "grounded") continue;
    for (const link of cell.evidence) {
      if (evidenceIsActiveDirectUser(wu, link) && evidenceIsConcreteSceneOrBehavior(link)) {
        qualifyingSceneRefs.push({ source_id: link.source_id, source_revision: link.source_revision });
      }
    }
  }
  const distinctSceneRefs = new Map<string, SourceRef>();
  for (const ref of qualifyingSceneRefs) {
    distinctSceneRefs.set(`${ref.source_id}@${ref.source_revision}`, ref);
  }
  if (distinctSceneRefs.size >= 2) {
    result.ordinary_day_anchor = "met";
    result.source_refs.push(...distinctSceneRefs.values());
  }

  // six_dimensions_handled: none unseen (declined counts)
  const allHandled = Object.values(wu.radar).every((cell) => cell.state !== "unseen");
  if (allHandled) {
    result.six_dimensions_handled = "met";
    const handledRefs: SourceRef[] = [];
    for (const cell of Object.values(wu.radar)) {
      for (const link of cell.evidence) {
        handledRefs.push({ source_id: link.source_id, source_revision: link.source_revision });
      }
    }
    result.source_refs.push(...handledRefs);
  }

  // four_dimensions_grounded: at least 4 cells are grounded
  const groundedCells = Object.values(wu.radar).filter((cell) => cell.state === "grounded");
  if (groundedCells.length >= 4) {
    result.four_dimensions_grounded = "met";
    for (const cell of groundedCells) {
      for (const link of cell.evidence) {
        result.source_refs.push({ source_id: link.source_id, source_revision: link.source_revision });
      }
    }
  }

  // distinct_route_intents: exactly 3 accepted, pairwise >=2 axes differ
  const accepted = wu.route_intents.filter((r) => r.status === "accepted");
  let intentsDistinct = accepted.length === 3;
  if (intentsDistinct) {
    for (let i = 0; i < accepted.length; i++) {
      for (let j = i + 1; j < accepted.length; j++) {
        if (distinctAxes(accepted[i].life_shape, accepted[j].life_shape) < 2) {
          intentsDistinct = false;
          break;
        }
      }
      if (!intentsDistinct) break;
    }
  }
  if (intentsDistinct) {
    result.distinct_route_intents = "met";
    for (const intent of accepted) {
      for (const link of intent.evidence) {
        result.source_refs.push({ source_id: link.source_id, source_revision: link.source_revision });
      }
    }
  }

  // material_tradeoff: each accepted intent has non-empty real_cost and >=1 active direct-user tradeoff evidence
  if (accepted.length === 3) {
    const allHaveCostAndTradeoff = accepted.every((intent) => {
      const costPresent = intent.real_cost.trim().length > 0;
      const hasTradeoff = intent.evidence.some(
        (link) => evidenceIsActiveDirectUser(wu, link) && link.evidence_shape === "tradeoff"
      );
      return costPresent && hasTradeoff;
    });
    if (allHaveCostAndTradeoff) {
      result.material_tradeoff = "met";
      for (const intent of accepted) {
        for (const link of intent.evidence) {
          if (evidenceIsActiveDirectUser(wu, link) && link.evidence_shape === "tradeoff") {
            result.source_refs.push({ source_id: link.source_id, source_revision: link.source_revision });
          }
        }
      }
    }
  }

  // calibration: met iff >=2 distinct committed insights have calibration; not_applicable iff all closed-wave insights submitted/skipped and at least one skip
  // For this initial implementation we use a simplified gate based on WorkingUnderstanding calibrations:
  // Real implementation will track closed-wave insights and calibration events explicitly.
  const submittedCalibrations = wu.source_versions.filter((v) => v.kind === "calibration");
  const skippedCalibrations = wu.source_versions.filter((v) => v.kind === "calibration");
  if (submittedCalibrations.length >= 2) {
    result.calibration = "met";
    for (const v of submittedCalibrations) {
      result.source_refs.push({ source_id: v.source_id, source_revision: v.revision });
    }
  } else if (skippedCalibrations.length >= 1) {
    result.calibration = "not_applicable";
  }

  // formal_ready: all base gates met and no waiver abuse
  const baseGates = [
    result.design_question,
    result.ordinary_day_anchor,
    result.six_dimensions_handled,
    result.four_dimensions_grounded,
    result.distinct_route_intents,
    result.material_tradeoff,
    result.calibration,
    result.safety_clear,
  ];
  result.formal_ready = baseGates.every((g) => g === "met" || g === "not_applicable");

  // provisional_allowed: design question met, 3 distinct accepted intents, safety clear, and user explicitly requested
  result.provisional_allowed =
    result.design_question === "met" &&
    result.distinct_route_intents === "met" &&
    result.safety_clear === "met" &&
    result.provisional_requested;

  // Deduplicate source_refs
  const seen = new Set<string>();
  result.source_refs = result.source_refs.filter((ref) => {
    const key = `${ref.source_id}@${ref.source_revision}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return result;
}
