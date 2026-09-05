import { setup, createMachine, assign, fromPromise } from "xstate";
import type {
  Id,
  Revision,
  WorkingUnderstanding,
  Wave,
  WaveMission,
  Microbatch,
  Question,
  ElicitationUnit,
  ImmediateInsight,
  Calibration,
  RouteIntent,
  OrdinaryDay,
  ParallelLivesPlan,
  TrialInstance,
  SafetyFlag,
  EventEnvelope,
} from "./contracts";
import type {
  SessionStarted,
  ConsentRecorded,
  MaterialAttached,
  WaveMissionCommitted,
  QuestionBatchCommitted,
  AnswerSubmitted,
  AnswerRevised,
  DesignQuestionSet,
  QuestionSkipped,
  WaveEndCommitted,
  InsightCommitted,
  CalibrationSubmitted,
  CalibrationSkipped,
  NextWaveCommitted,
  ProvisionalPreviewRequested,
  RoutePhaseEntered,
  RouteIntentCandidatesCommitted,
  RouteIntentEdited,
  RouteIntentsAccepted,
  ReadinessGateWaived,
  OrdinaryDaysCommitted,
  OrdinaryDayScreeningStarted,
  OrdinaryDayCalibrated,
  ParallelLivesCommitted,
  TrialStarted,
  TrialStatusChanged,
  TrialResumed,
  TrialReflectionSubmitted,
  BoundedReflectionOpened,
  ChatNoteCommitted,
  BlueprintCommitted,
  ReflectionClosed,
  SessionPaused,
  SessionResumed,
  ProviderFailed,
  ProviderRecovered,
  SafetyBoundaryTriggered,
  SessionDeleted,
} from "./events";

export type MachineContext = {
  session_id: Id;
  revision: Revision;
  workingUnderstanding: WorkingUnderstanding;
  waves: Wave[];
  currentWaveId?: Id;
  currentMicrobatchId?: Id;
  pendingInsight?: ImmediateInsight;
  pendingCalibration?: Calibration;
  routeIntents: RouteIntent[];
  ordinaryDays?: [OrdinaryDay, OrdinaryDay, OrdinaryDay];
  parallelPlan?: ParallelLivesPlan;
  activeTrials: TrialInstance[];
  pausedTrials: TrialInstance[];
  safetyFlags: SafetyFlag[];
  resumeState?: string;
  lastError?: { action: string; code: string; correlation_id: Id };
};

export type MachineEvent =
  | { type: "SESSION_STARTED"; envelope: EventEnvelope<"SESSION_STARTED", SessionStarted> }
  | { type: "CONSENT_RECORDED"; envelope: EventEnvelope<"CONSENT_RECORDED", ConsentRecorded> }
  | { type: "MATERIAL_ATTACHED"; envelope: EventEnvelope<"MATERIAL_ATTACHED", MaterialAttached> }
  | { type: "WAVE_MISSION_COMMITTED"; envelope: EventEnvelope<"WAVE_MISSION_COMMITTED", WaveMissionCommitted> }
  | { type: "QUESTION_BATCH_COMMITTED"; envelope: EventEnvelope<"QUESTION_BATCH_COMMITTED", QuestionBatchCommitted> }
  | { type: "ANSWER_SUBMITTED"; envelope: EventEnvelope<"ANSWER_SUBMITTED", AnswerSubmitted> }
  | { type: "ANSWER_REVISED"; envelope: EventEnvelope<"ANSWER_REVISED", AnswerRevised> }
  | { type: "DESIGN_QUESTION_SET"; envelope: EventEnvelope<"DESIGN_QUESTION_SET", DesignQuestionSet> }
  | { type: "QUESTION_SKIPPED"; envelope: EventEnvelope<"QUESTION_SKIPPED", QuestionSkipped> }
  | { type: "WAVE_END_COMMITTED"; envelope: EventEnvelope<"WAVE_END_COMMITTED", WaveEndCommitted> }
  | { type: "INSIGHT_COMMITTED"; envelope: EventEnvelope<"INSIGHT_COMMITTED", InsightCommitted> }
  | { type: "CALIBRATION_SUBMITTED"; envelope: EventEnvelope<"CALIBRATION_SUBMITTED", CalibrationSubmitted> }
  | { type: "CALIBRATION_SKIPPED"; envelope: EventEnvelope<"CALIBRATION_SKIPPED", CalibrationSkipped> }
  | { type: "NEXT_WAVE_COMMITTED"; envelope: EventEnvelope<"NEXT_WAVE_COMMITTED", NextWaveCommitted> }
  | { type: "PROVISIONAL_PREVIEW_REQUESTED"; envelope: EventEnvelope<"PROVISIONAL_PREVIEW_REQUESTED", ProvisionalPreviewRequested> }
  | { type: "ROUTE_PHASE_ENTERED"; envelope: EventEnvelope<"ROUTE_PHASE_ENTERED", RoutePhaseEntered> }
  | { type: "ROUTE_INTENT_CANDIDATES_COMMITTED"; envelope: EventEnvelope<"ROUTE_INTENT_CANDIDATES_COMMITTED", RouteIntentCandidatesCommitted> }
  | { type: "ROUTE_INTENT_EDITED"; envelope: EventEnvelope<"ROUTE_INTENT_EDITED", RouteIntentEdited> }
  | { type: "ROUTE_INTENTS_ACCEPTED"; envelope: EventEnvelope<"ROUTE_INTENTS_ACCEPTED", RouteIntentsAccepted> }
  | { type: "READINESS_GATE_WAIVED"; envelope: EventEnvelope<"READINESS_GATE_WAIVED", ReadinessGateWaived> }
  | { type: "ORDINARY_DAYS_COMMITTED"; envelope: EventEnvelope<"ORDINARY_DAYS_COMMITTED", OrdinaryDaysCommitted> }
  | { type: "ORDINARY_DAY_SCREENING_STARTED"; envelope: EventEnvelope<"ORDINARY_DAY_SCREENING_STARTED", OrdinaryDayScreeningStarted> }
  | { type: "ORDINARY_DAY_CALIBRATED"; envelope: EventEnvelope<"ORDINARY_DAY_CALIBRATED", OrdinaryDayCalibrated> }
  | { type: "PARALLEL_LIVES_COMMITTED"; envelope: EventEnvelope<"PARALLEL_LIVES_COMMITTED", ParallelLivesCommitted> }
  | { type: "TRIAL_STARTED"; envelope: EventEnvelope<"TRIAL_STARTED", TrialStarted> }
  | { type: "TRIAL_STATUS_CHANGED"; envelope: EventEnvelope<"TRIAL_STATUS_CHANGED", TrialStatusChanged> }
  | { type: "TRIAL_RESUMED"; envelope: EventEnvelope<"TRIAL_RESUMED", TrialResumed> }
  | { type: "TRIAL_REFLECTION_SUBMITTED"; envelope: EventEnvelope<"TRIAL_REFLECTION_SUBMITTED", TrialReflectionSubmitted> }
  | { type: "BOUNDED_REFLECTION_OPENED"; envelope: EventEnvelope<"BOUNDED_REFLECTION_OPENED", BoundedReflectionOpened> }
  | { type: "CHAT_NOTE_COMMITTED"; envelope: EventEnvelope<"CHAT_NOTE_COMMITTED", ChatNoteCommitted> }
  | { type: "BLUEPRINT_COMMITTED"; envelope: EventEnvelope<"BLUEPRINT_COMMITTED", BlueprintCommitted> }
  | { type: "REFLECTION_CLOSED"; envelope: EventEnvelope<"REFLECTION_CLOSED", ReflectionClosed> }
  | { type: "SESSION_PAUSED"; envelope: EventEnvelope<"SESSION_PAUSED", SessionPaused> }
  | { type: "SESSION_RESUMED"; envelope: EventEnvelope<"SESSION_RESUMED", SessionResumed> }
  | { type: "PROVIDER_FAILED"; envelope: EventEnvelope<"PROVIDER_FAILED", ProviderFailed> }
  | { type: "PROVIDER_RECOVERED"; envelope: EventEnvelope<"PROVIDER_RECOVERED", ProviderRecovered> }
  | { type: "SAFETY_BOUNDARY_TRIGGERED"; envelope: EventEnvelope<"SAFETY_BOUNDARY_TRIGGERED", SafetyBoundaryTriggered> }
  | { type: "SESSION_DELETED"; envelope: EventEnvelope<"SESSION_DELETED", SessionDeleted> };

export const harnessMachine = setup({
  types: {
    context: {} as MachineContext,
    events: {} as MachineEvent,
  },
  actors: {},
  actions: {
    incrementRevision: assign({
      revision: ({ context }) => context.revision + 1,
    }),
    setLastError: assign({
      lastError: ({ event }) => {
        const e = (event as MachineEvent).envelope;
        return { action: e.event_type, code: "COMMITTED", correlation_id: e.correlation_id };
      },
    }),
    clearLastError: assign({
      lastError: undefined,
    }),
    storeResumeState: assign({
      resumeState: ({ self }) => JSON.stringify(self.getSnapshot().value),
    }),
    clearResumeState: assign({
      resumeState: undefined,
    }),
    setRouteIntentCandidates: assign({
      workingUnderstanding: ({ context, event }) => {
        const e = (event as MachineEvent).envelope;
        if (e.event_type === "ROUTE_INTENT_CANDIDATES_COMMITTED") {
          const p = e.payload as RouteIntentCandidatesCommitted;
          return { ...context.workingUnderstanding, route_intents: p.intents };
        }
        return context.workingUnderstanding;
      },
    }),
    setAcceptedRouteIntents: assign({
      workingUnderstanding: ({ context, event }) => {
        const e = (event as MachineEvent).envelope;
        if (e.event_type === "ROUTE_INTENTS_ACCEPTED") {
          const p = e.payload as RouteIntentsAccepted;
          return { ...context.workingUnderstanding, route_intents: p.intents };
        }
        return context.workingUnderstanding;
      },
    }),
  },
  guards: {
    hasAIConsent: ({ context }) => {
      // Placeholder: real guard checks consent records from context
      return true;
    },
    waveIndexWithinLimit: ({ context, event }) => {
      const e = (event as MachineEvent).envelope;
      if (e.event_type !== "WAVE_MISSION_COMMITTED" && e.event_type !== "NEXT_WAVE_COMMITTED") return false;
      const wave = "wave" in e.payload ? (e.payload as { wave: Wave }).wave : undefined;
      if (!wave) return false;
      return wave.index >= 1 && wave.index <= 8;
    },
    deepDiveWithinLimit: ({ context, event }) => {
      const e = (event as MachineEvent).envelope;
      if (e.event_type !== "NEXT_WAVE_COMMITTED") return true;
      const payload = e.payload as NextWaveCommitted;
      if (payload.kind !== "deep_dive") return true;
      const deepDives = context.waves.filter((w) => w.kind === "deep_dive").length;
      return deepDives < 2;
    },
    waveAndDeepDiveWithinLimit: ({ context, event }) => {
      const e = (event as MachineEvent).envelope;
      let wave: Wave | undefined;
      if (e.event_type === "WAVE_MISSION_COMMITTED") {
        wave = (e.payload as WaveMissionCommitted).wave;
      } else if (e.event_type === "NEXT_WAVE_COMMITTED") {
        const payload = e.payload as NextWaveCommitted;
        if (payload.kind === "deep_dive") {
          const deepDives = context.waves.filter((w) => w.kind === "deep_dive").length;
          if (deepDives >= 2) return false;
        }
      }
      if (wave) {
        return wave.index >= 1 && wave.index <= 8;
      }
      return true;
    },
    exactlyThreeAcceptedIntents: ({ context, event }) => {
      const e = (event as MachineEvent).envelope;
      if (e.event_type !== "ROUTE_INTENTS_ACCEPTED") return false;
      const payload = e.payload as RouteIntentsAccepted;
      return payload.intents.length === 3;
    },
    noActiveSafetyFlag: ({ context }) => {
      return context.safetyFlags.every((f) => f.status === "resolved");
    },
    hasThreeAcceptedRouteIntents: ({ context }) => {
      const accepted = context.workingUnderstanding.route_intents.filter((r) => r.status === "accepted");
      if (accepted.length !== 3) return false;
      return true;
    },
    safetyTriggered: ({ event }) => {
      const e = (event as MachineEvent).envelope;
      return e.safety_flag !== undefined;
    },
  },
}).createMachine({
  id: "harness",
  initial: "entry",
  on: {
    SAFETY_BOUNDARY_TRIGGERED: {
      target: ".safety_stop",
      guard: "safetyTriggered",
      actions: "incrementRevision",
    },
    SESSION_PAUSED: {
      target: ".paused",
      actions: ["storeResumeState", "incrementRevision"],
    },
    PROVIDER_FAILED: {
      target: ".degraded",
      actions: ["storeResumeState", "setLastError", "incrementRevision"],
    },
  },
  context: {
    session_id: "",
    revision: 0,
    workingUnderstanding: {
      session_id: "",
      revision: 0,
      design_question: undefined,
      design_question_source_refs: [],
      source_heads: [],
      source_versions: [],
      claims: [],
      constraints: [],
      radar: {
        traits: { dimension: "traits", state: "unseen", reason: "", evidence: [], updated_at: new Date().toISOString() },
        motivation: { dimension: "motivation", state: "unseen", reason: "", evidence: [], updated_at: new Date().toISOString() },
        capabilities: { dimension: "capabilities", state: "unseen", reason: "", evidence: [], updated_at: new Date().toISOString() },
        relationships: { dimension: "relationships", state: "unseen", reason: "", evidence: [], updated_at: new Date().toISOString() },
        environment: { dimension: "environment", state: "unseen", reason: "", evidence: [], updated_at: new Date().toISOString() },
        narrative: { dimension: "narrative", state: "unseen", reason: "", evidence: [], updated_at: new Date().toISOString() },
      },
      route_intents: [],
      corrections: [],
      declined_topics: [],
    },
    waves: [],
    routeIntents: [],
    activeTrials: [],
    pausedTrials: [],
    safetyFlags: [],
  },
  states: {
    entry: {
      on: {
        SESSION_STARTED: {
          target: "consent_and_optional_material",
          actions: "incrementRevision",
        },
      },
    },
    consent_and_optional_material: {
      on: {
        CONSENT_RECORDED: {
          target: "interviewing.orienting_wave",
          guard: "hasAIConsent",
          actions: "incrementRevision",
        },
        MATERIAL_ATTACHED: {
          actions: "incrementRevision",
        },
      },
    },
    interviewing: {
      initial: "orienting_wave",
      states: {
        hist: {
          type: "history",
          history: "deep",
        },
        orienting_wave: {
          on: {
            WAVE_MISSION_COMMITTED: {
              target: "awaiting_answers",
              guard: "waveAndDeepDiveWithinLimit",
              actions: "incrementRevision",
            },
            PROVISIONAL_PREVIEW_REQUESTED: {
              actions: "incrementRevision",
            },
            ROUTE_PHASE_ENTERED: {
              target: "#harness.route_intents",
              guard: "noActiveSafetyFlag",
              actions: "incrementRevision",
            },
          },
        },
        awaiting_answers: {
          on: {
            QUESTION_BATCH_COMMITTED: {
              actions: ["incrementRevision"],
            },
            ANSWER_SUBMITTED: {
              actions: "incrementRevision",
            },
            ANSWER_REVISED: {
              actions: "incrementRevision",
            },
            DESIGN_QUESTION_SET: {
              actions: "incrementRevision",
            },
            QUESTION_SKIPPED: {
              actions: "incrementRevision",
            },
            WAVE_END_COMMITTED: {
              target: "synthesizing_wave",
              actions: "incrementRevision",
            },
          },
        },
        synthesizing_wave: {
          on: {
            INSIGHT_COMMITTED: {
              target: "awaiting_calibration",
              actions: "incrementRevision",
            },
          },
        },
        awaiting_calibration: {
          on: {
            CALIBRATION_SUBMITTED: {
              actions: "incrementRevision",
            },
            CALIBRATION_SKIPPED: {
              actions: "incrementRevision",
            },
            NEXT_WAVE_COMMITTED: {
              target: "orienting_wave",
              guard: "waveAndDeepDiveWithinLimit",
              actions: "incrementRevision",
            },
            ROUTE_PHASE_ENTERED: {
              target: "#harness.route_intents",
              guard: "noActiveSafetyFlag",
              actions: "incrementRevision",
            },
          },
        },
      },
      on: {
        SAFETY_BOUNDARY_TRIGGERED: {
          target: "safety_stop",
          guard: "safetyTriggered",
          actions: "incrementRevision",
        },
      },
    },
    route_intents: {
      on: {
        ROUTE_INTENT_CANDIDATES_COMMITTED: {
          actions: ["setRouteIntentCandidates", "incrementRevision"],
        },
        ROUTE_INTENT_EDITED: {
          actions: "incrementRevision",
        },
        ROUTE_INTENTS_ACCEPTED: {
          guard: "exactlyThreeAcceptedIntents",
          actions: ["setAcceptedRouteIntents", "incrementRevision"],
        },
        READINESS_GATE_WAIVED: {
          actions: "incrementRevision",
        },
        ORDINARY_DAY_SCREENING_STARTED: {
          target: "ordinary_day_screening",
          guard: "hasThreeAcceptedRouteIntents",
          actions: "incrementRevision",
        },

        SAFETY_BOUNDARY_TRIGGERED: {
          target: "safety_stop",
          actions: "incrementRevision",
        },
      },
    },
    ordinary_day_screening: {
      on: {
        ORDINARY_DAYS_COMMITTED: {
          actions: "incrementRevision",
        },
        ORDINARY_DAY_CALIBRATED: {
          actions: "incrementRevision",
        },
        PARALLEL_LIVES_COMMITTED: {
          target: "parallel_lives_ready",
          actions: "incrementRevision",
        },

        SAFETY_BOUNDARY_TRIGGERED: {
          target: "safety_stop",
          actions: "incrementRevision",
        },
      },
    },
    parallel_lives_ready: {
      on: {
        TRIAL_STARTED: {
          target: "trial_active",
          actions: "incrementRevision",
        },
        BOUNDED_REFLECTION_OPENED: {
          target: "bounded_reflection",
          actions: "incrementRevision",
        },
        BLUEPRINT_COMMITTED: {
          actions: "incrementRevision",
        },

        SAFETY_BOUNDARY_TRIGGERED: {
          target: "safety_stop",
          actions: "incrementRevision",
        },
      },
    },
    trial_active: {
      on: {
        TRIAL_STATUS_CHANGED: {
          target: "parallel_lives_ready",
          actions: "incrementRevision",
        },
        TRIAL_REFLECTION_SUBMITTED: {
          target: "bounded_reflection",
          actions: "incrementRevision",
        },

        SAFETY_BOUNDARY_TRIGGERED: {
          target: "safety_stop",
          actions: "incrementRevision",
        },
      },
    },
    bounded_reflection: {
      on: {
        CHAT_NOTE_COMMITTED: {
          actions: "incrementRevision",
        },
        TRIAL_REFLECTION_SUBMITTED: {
          actions: "incrementRevision",
        },
        BLUEPRINT_COMMITTED: {
          actions: "incrementRevision",
        },
        TRIAL_STARTED: {
          target: "trial_active",
          actions: "incrementRevision",
        },
        REFLECTION_CLOSED: {
          target: "parallel_lives_ready",
          actions: "incrementRevision",
        },

        SAFETY_BOUNDARY_TRIGGERED: {
          target: "safety_stop",
          actions: "incrementRevision",
        },
      },
    },
    paused: {
      on: {
        SESSION_PAUSED: { actions: [] },
        SESSION_RESUMED: {
          target: "resuming",
          actions: ["clearLastError", "incrementRevision"],
        },
      },
    },
    degraded: {
      on: {
        PROVIDER_FAILED: { actions: [] },
        PROVIDER_RECOVERED: {
          target: "resuming",
          actions: ["clearLastError", "incrementRevision"],
        },
      },
    },
    resuming: {
      entry: ["clearLastError", "clearResumeState"],
      always: [
        {
          guard: ({ context }) => {
            if (!context.resumeState) return false;
            const state = JSON.parse(context.resumeState);
            return typeof state === "object" && Object.keys(state)[0] === "interviewing";
          },
          target: "interviewing.hist",
        },
        {
          guard: ({ context }) => {
            if (!context.resumeState) return false;
            const state = JSON.parse(context.resumeState);
            return state === "route_intents" || (typeof state === "object" && Object.keys(state)[0] === "route_intents");
          },
          target: "route_intents",
        },
        {
          guard: ({ context }) => {
            if (!context.resumeState) return false;
            const state = JSON.parse(context.resumeState);
            return state === "ordinary_day_screening" || (typeof state === "object" && Object.keys(state)[0] === "ordinary_day_screening");
          },
          target: "ordinary_day_screening",
        },
        {
          guard: ({ context }) => {
            if (!context.resumeState) return false;
            const state = JSON.parse(context.resumeState);
            return state === "parallel_lives_ready" || (typeof state === "object" && Object.keys(state)[0] === "parallel_lives_ready");
          },
          target: "parallel_lives_ready",
        },
        {
          guard: ({ context }) => {
            if (!context.resumeState) return false;
            const state = JSON.parse(context.resumeState);
            return state === "trial_active" || (typeof state === "object" && Object.keys(state)[0] === "trial_active");
          },
          target: "trial_active",
        },
        {
          guard: ({ context }) => {
            if (!context.resumeState) return false;
            const state = JSON.parse(context.resumeState);
            return state === "bounded_reflection" || (typeof state === "object" && Object.keys(state)[0] === "bounded_reflection");
          },
          target: "bounded_reflection",
        },
        {
          guard: ({ context }) => {
            if (!context.resumeState) return false;
            const state = JSON.parse(context.resumeState);
            return state === "consent_and_optional_material" || (typeof state === "object" && Object.keys(state)[0] === "consent_and_optional_material");
          },
          target: "consent_and_optional_material",
        },
        {
          target: "interviewing.orienting_wave",
        },
      ],
    },
    safety_stop: {
      type: "final",
    },
  },
});
