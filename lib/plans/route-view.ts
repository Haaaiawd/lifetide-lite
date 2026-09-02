import type { Route } from "@/lib/fixtures";
import type { ParallelLife } from "@/lib/working-memory/types";

export function toRouteView(life: ParallelLife, index: number, trialStatus: Route["trialStatus"] = "not_started"): Route {
  const number = index < 9 ? `0${index + 1}` : String(index + 1);
  const proto = life.prototype ?? life.trial;

  return {
    id: life.id,
    number,
    title: life.title,
    coreExperience: life.core_experience,
    year1: life.year_1,
    year2: life.year_2,
    year3: life.year_3,
    ordinaryDay: life.ordinary_day,
    dayNarrative: life.day_narrative,
    attractions: life.attractions,
    costsAndTradeoffs: life.costs_and_tradeoffs,
    evidenceFor: life.evidence_for.map((e) => ({
      id: e.source_id,
      supports: e.excerpt ?? e.relevance,
    })),
    assumptions: life.assumptions,
    unknowns: life.uncertainties,
    risks: life.risks,
    prototype: {
      hypothesis: proto.hypothesis,
      todayAction: proto.today_action,
      whatToObserve: proto.what_to_observe,
      day1: proto.day_1,
      day2: proto.day_2,
      day3: proto.day_3,
      timeCeilingHours: proto.time_ceiling_hours,
      moneyCeiling: proto.money_ceiling,
      reversibleBecause: proto.reversible_because,
      feedbackSource: proto.feedback_source,
      continueSignal: proto.continue_signal,
      pauseOrExitNote: proto.pause_or_exit_note,
      safetyCheck: proto.safety_check,
    },
    trialStatus,
  };
}
