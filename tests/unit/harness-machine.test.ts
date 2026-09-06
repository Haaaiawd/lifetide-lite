import { describe, it, expect } from "vitest";
import { createActor } from "xstate";
import { harnessMachine } from "@/lib/state/machine";

describe("harness machine transitions", () => {
  it("starts in entry and moves to consent on SESSION_STARTED", () => {
    const actor = createActor(harnessMachine, {
      input: {},
    });
    actor.start();
    expect(actor.getSnapshot().value).toBe("entry");

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
    expect(actor.getSnapshot().value).toBe("consent_and_optional_material");
  });

  it("moves from consent to interviewing.orienting_wave on CONSENT_RECORDED", () => {
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
    expect(actor.getSnapshot().value).toEqual({ interviewing: "orienting_wave" });
  });

  it("rejects a 9th wave", () => {
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

    // Attempt to commit wave with index 9
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
        idempotency_key: "k3",
        correlation_id: "c3",
        proposal_id: "p1",
        payload_hash: "h3",
        payload: {
          proposal_id: "p1",
          generation_provenance: {} as any,
          wave: {
            id: "w9",
            index: 9,
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
    // Guard should reject; state should remain orienting_wave
    expect(actor.getSnapshot().value).toEqual({ interviewing: "orienting_wave" });
  });

  it("transitions to safety_stop on SAFETY_BOUNDARY_TRIGGERED", () => {
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
      type: "SAFETY_BOUNDARY_TRIGGERED",
      envelope: {
        event_id: "e2",
        event_type: "SAFETY_BOUNDARY_TRIGGERED",
        schema_version: 3,
        session_id: "s1",
        actor: "host",
        base_revision: 1,
        emitted_at: new Date().toISOString(),
        idempotency_key: "k2",
        correlation_id: "c2",
        payload_hash: "h2",
        safety_flag: {
          id: "f1",
          session_id: "s1",
          policy_version: "v1",
          trigger_code: "crisis_signal",
          status: "active",
          source_refs: [],
          created_at: new Date().toISOString(),
        },
        payload: { flag: {} as any, locale: "zh" },
      },
    });
    expect(actor.getSnapshot().value).toBe("safety_stop");
  });

  it("resumes to the previous state after SESSION_PAUSED", () => {
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

    expect(actor.getSnapshot().value).toEqual({ interviewing: "orienting_wave" });

    actor.send({
      type: "SESSION_PAUSED",
      envelope: {
        event_id: "e3",
        event_type: "SESSION_PAUSED",
        schema_version: 3,
        session_id: "s1",
        actor: "user",
        base_revision: 2,
        emitted_at: new Date().toISOString(),
        idempotency_key: "k3",
        correlation_id: "c3",
        payload_hash: "h3",
        payload: { resume_state: "", reason: "user" },
      },
    });
    expect(actor.getSnapshot().value).toBe("paused");

    actor.send({
      type: "SESSION_RESUMED",
      envelope: {
        event_id: "e4",
        event_type: "SESSION_RESUMED",
        schema_version: 3,
        session_id: "s1",
        actor: "user",
        base_revision: 3,
        emitted_at: new Date().toISOString(),
        idempotency_key: "k4",
        correlation_id: "c4",
        payload_hash: "h4",
        payload: { explicit: true },
      },
    });
    expect(actor.getSnapshot().value).toEqual({ interviewing: "orienting_wave" });
  });

  it("transitions from interviewing through final route events to parallel_lives_ready", () => {
    const actor = createActor(harnessMachine, { input: {} });
    actor.start();

    const send = (type: string, baseRevision: number, payload: unknown) => {
      actor.send({
        type,
        envelope: {
          event_id: `e${baseRevision + 1}`,
          event_type: type,
          schema_version: 3,
          session_id: "s1",
          actor: "host",
          base_revision: baseRevision,
          emitted_at: new Date().toISOString(),
          idempotency_key: `k${baseRevision + 1}`,
          correlation_id: `c${baseRevision + 1}`,
          payload_hash: `h${baseRevision + 1}`,
          payload,
        } as any,
      });
    };

    send("SESSION_STARTED", 0, { guest_token_hash: "abc", expires_at: new Date().toISOString() });
    send("CONSENT_RECORDED", 1, { consent_version: "v1", ai: true, upload: false });
    expect(actor.getSnapshot().value).toEqual({ interviewing: "orienting_wave" });

    send("ROUTE_PHASE_ENTERED", 2, { reason: "mission_sufficient", interview_snapshot_revision: 2 });
    expect(actor.getSnapshot().value).toBe("route_intents");

    const makeIntent = (id: string, status = "seed") => ({
      id,
      generation_provenance_id: "p1",
      title_hint: `route ${id}`,
      life_shape: {
        daily_rhythm: "daily",
        work_or_study: "work",
        relationships: "rel",
        environment: "env",
        responsibilities: "resp",
        resources: "res",
      },
      real_cost: "cost",
      evidence: [
        {
          source_id: "s1",
          source_revision: 1,
          epistemic_status: "user_stated",
          evidence_shape: "concrete_scene",
          relevance: "rel",
        },
      ],
      status,
    });

    const intents = [makeIntent("i1"), makeIntent("i2"), makeIntent("i3")];
    send("ROUTE_INTENT_CANDIDATES_COMMITTED", 3, {
      proposal_id: "p1",
      generation_provenance: {},
      intents,
    } as any);
    expect(actor.getSnapshot().value).toBe("route_intents");

    send("ROUTE_INTENTS_ACCEPTED", 4, {
      intents: intents.map((i) => ({ ...i, status: "accepted" })),
    } as any);
    expect(actor.getSnapshot().value).toBe("route_intents");

    send("ORDINARY_DAY_SCREENING_STARTED", 5, {
      accepted_intent_ids: ["i1", "i2", "i3"],
    } as any);
    expect(actor.getSnapshot().value).toBe("ordinary_day_screening");

    send("ORDINARY_DAYS_COMMITTED", 6, {
      proposal_id: "p2",
      generation_provenance: {},
      days: [],
    } as any);
    expect(actor.getSnapshot().value).toBe("ordinary_day_screening");

    send("PARALLEL_LIVES_COMMITTED", 7, {
      proposal_id: "p3",
      generation_provenance: {},
      plan: {},
    } as any);
    expect(actor.getSnapshot().value).toBe("parallel_lives_ready");
  });
});
