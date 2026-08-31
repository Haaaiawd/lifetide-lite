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

  it("rejects a 6th wave", () => {
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

    // Attempt to commit wave with index 6
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
            id: "w6",
            index: 6,
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
});
