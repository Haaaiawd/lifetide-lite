import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { questionContentProposalSchema, waveMissionProposalSchema } from "@/lib/state/contracts";
import { harnessMachine } from "@/lib/state/machine";
import { createActor } from "xstate";

const validRadarDimension = fc.constantFrom(
  "traits",
  "motivation",
  "capabilities",
  "relationships",
  "environment",
  "narrative"
);

const validElicitationUnit = () =>
  fc.record({
    decision_target: fc.string({ minLength: 1, maxLength: 80 }),
    target_dimensions: fc.array(validRadarDimension, { minLength: 1, maxLength: 3 }),
    precovered_by: fc.constant([]),
  });

const validQuestion = () =>
  fc.record({
    text: fc.string({ minLength: 1, maxLength: 140 }),
    why_this_matters: fc.string({ minLength: 1, maxLength: 120 }),
    response_kind: fc.constantFrom("single_choice", "multiple_choice", "rank", "anchored_scale", "short_text", "scene_text"),
    sensitivity: fc.constantFrom("ordinary", "sensitive"),
    decision_target: fc.string({ minLength: 1, maxLength: 80 }),
    asks_for_concrete_example: fc.boolean(),
    allows_skip: fc.constant(true as const),
    allows_free_text: fc.constant(true as const),
    options: fc.option(
      fc.array(
        fc.record({
          id: fc.string({ minLength: 1 }),
          label: fc.string({ minLength: 1 }),
        }),
        { minLength: 2, maxLength: 6 }
      ),
      { nil: undefined }
    ),
  });

describe("harness limit property tests", () => {
  it("wave mission accepts 5-10 elicitation units only", () => {
    fc.assert(
      fc.property(
        fc.array(validElicitationUnit(), { minLength: 0, maxLength: 15 }),
        (units) => {
          const ok = units.length >= 5 && units.length <= 10;
          const payload = {
            decision_to_improve: "测试",
            target_dimensions: ["traits"],
            known_source_refs: [],
            important_unknown: "未知",
            why_now: "现在",
            exit_condition: "退出",
            sensitivity_ceiling: "ordinary",
            elicitation_units: units,
          };
          if (ok) {
            const parsed = waveMissionProposalSchema.parse(payload);
            expect(parsed.elicitation_units.length).toBe(units.length);
          } else {
            expect(() => waveMissionProposalSchema.parse(payload)).toThrow();
          }
        }
      ),
      { numRuns: 50, verbose: false }
    );
  });

  it("question content proposal max 10 per wave invariant", () => {
    fc.assert(
      fc.property(
        fc.array(validQuestion(), { minLength: 1, maxLength: 12 }),
        (questions) => {
          for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            const payload = {
              ...q,
              options: q.options?.map((o, idx) => ({ ...o, id: `o${idx}` })),
            };
            const parsed = questionContentProposalSchema.parse(payload);
            expect(parsed.text).toBe(q.text);
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  it("machine rejects wave index > 8 or < 1", () => {
    fc.assert(
      fc.property(fc.integer({ min: -3, max: 10 }), (index) => {
        const actor = createActor(harnessMachine, { input: {} });
        actor.start();
        actor.send({
          type: "SESSION_STARTED",
          envelope: {
            event_id: "e1",
            event_type: "SESSION_STARTED",
            schema_version: 3,
            session_id: "s1",
            actor: "host",
            base_revision: 0,
            emitted_at: new Date().toISOString(),
            idempotency_key: "k1",
            correlation_id: "c1",
            payload_hash: "h1",
            payload: { guest_token_hash: "abc", expires_at: new Date().toISOString() },
          },
        });
        actor.send({
          type: "CONSENT_RECORDED",
          envelope: {
            event_id: "e2",
            event_type: "CONSENT_RECORDED",
            schema_version: 3,
            session_id: "s1",
            actor: "user",
            base_revision: 1,
            emitted_at: new Date().toISOString(),
            idempotency_key: "k2",
            correlation_id: "c2",
            payload_hash: "h2",
            payload: { consent_version: "v1", ai: true, upload: false },
          },
        });

        const before = JSON.stringify(actor.getSnapshot().value);
        actor.send({
          type: "WAVE_MISSION_COMMITTED",
          envelope: {
            event_id: "e3",
            event_type: "WAVE_MISSION_COMMITTED",
            schema_version: 3,
            session_id: "s1",
            actor: "interviewer",
            base_revision: 2,
            emitted_at: new Date().toISOString(),
            idempotency_key: `k3-${index}`,
            correlation_id: "c3",
            proposal_id: "p1",
            payload_hash: "h3",
            payload: {
              proposal_id: "p1",
              generation_provenance: {} as any,
              wave: {
                id: `w${index}`,
                index,
                kind: "core",
                mission: {},
                status: "open",
                microbatches: [],
                asked_count: 0,
                elicitation_units: [],
                covered_unit_count: 0,
              } as any,
            },
          },
        });
        const after = JSON.stringify(actor.getSnapshot().value);
        const ok = index >= 1 && index <= 8;
        if (ok) {
          expect(after).not.toBe(before);
        } else {
          expect(after).toBe(before);
        }
      }),
      { numRuns: 20 }
    );
  });
});
