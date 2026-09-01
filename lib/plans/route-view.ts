import type { Route } from "@/lib/fixtures";
import type { ParallelLife } from "@/lib/working-memory/types";

export function toRouteView(life: ParallelLife, index: number, trialStatus: Route["trialStatus"] = "not_started"): Route {
  const number = index < 9 ? `0${index + 1}` : String(index + 1);

  return {
    id: life.id,
    number,
    title: life.title,
    coreExperience: life.core_experience,
    year1: life.year_1,
    year2: life.year_2,
    year3: life.year_3,
    ordinaryDay: life.ordinary_day,
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
      hypothesis: life.trial.hypothesis,
      todayAction: life.trial.today_action,
      whatToObserve: life.trial.what_to_observe,
      day1: life.trial.day_1,
      day2: life.trial.day_2,
      day3: life.trial.day_3,
      timeCeilingHours: life.trial.time_ceiling_hours,
      moneyCeiling: life.trial.money_ceiling,
      reversibleBecause: life.trial.reversible_because,
      feedbackSource: life.trial.feedback_source,
      continueSignal: life.trial.continue_signal,
      pauseOrExitNote: life.trial.pause_or_exit_note,
      safetyCheck: life.trial.safety_check,
    },
    trialStatus,
  };
}
