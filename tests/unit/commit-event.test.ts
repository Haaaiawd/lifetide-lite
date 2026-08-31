import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { commitEvent } from "@/lib/db/commit";
import { makeEnvelope } from "@/lib/state/envelope";
import type { SessionStarted, ConsentRecorded } from "@/lib/state/events";

describe("commitEvent revision and idempotency semantics", () => {
  let sessionId: string;

  beforeAll(async () => {
    const session = await prisma.session.create({
      data: {
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    sessionId = session.id;
  });

  afterAll(async () => {
    await prisma.$transaction([
      prisma.transitionEvent.deleteMany({ where: { sessionId } }),
      prisma.sessionStateHead.deleteMany({ where: { sessionId } }),
      prisma.session.deleteMany({ where: { id: sessionId } }),
    ]);
    await prisma.$disconnect();
  });

  const sessionStartedPayload: SessionStarted = {
    guest_token_hash: "guest-" + randomUUID(),
    expires_at: new Date().toISOString(),
  };

  it("commits SESSION_STARTED and creates SessionStateHead + TransitionEvent", async () => {
    const envelope = makeEnvelope("SESSION_STARTED", {
      session_id: sessionId,
      actor: "system",
      base_revision: 0,
      idempotency_key: `start-${sessionId}`,
      payload: sessionStartedPayload,
    });

    const result = await commitEvent(sessionId, envelope);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.nextRevision).toBe(1);

    const head = await prisma.sessionStateHead.findUnique({ where: { sessionId } });
    expect(head).not.toBeNull();
    expect(head!.revision).toBe(1);

    const events = await prisma.transitionEvent.findMany({ where: { sessionId } });
    expect(events.length).toBe(1);
    expect(events[0].eventType).toBe("SESSION_STARTED");
    expect(events[0].baseRevision).toBe(0);
    expect(events[0].committedRevision).toBe(1);
  });

  it("idempotent replay returns the same revision without writing a second row", async () => {
    const envelope = makeEnvelope("SESSION_STARTED", {
      session_id: sessionId,
      actor: "system",
      base_revision: 0,
      idempotency_key: `start-${sessionId}`,
      payload: sessionStartedPayload,
    });

    const result = await commitEvent(sessionId, envelope);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.nextRevision).toBe(1);

    const events = await prisma.transitionEvent.findMany({ where: { sessionId } });
    expect(events.length).toBe(1);
  });

  it("rejects stale base revision with REVISION_CONFLICT", async () => {
    const payload: ConsentRecorded = { consent_version: "v1", ai: true, upload: false };
    const envelope = makeEnvelope("CONSENT_RECORDED", {
      session_id: sessionId,
      actor: "user",
      base_revision: 0, // stale, current is 1
      idempotency_key: `consent-${sessionId}`,
      payload,
    });

    const result = await commitEvent(sessionId, envelope);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("REVISION_CONFLICT");

    const events = await prisma.transitionEvent.findMany({ where: { sessionId } });
    expect(events.length).toBe(1);
  });

  it("rejects idempotency key reuse with different payload", async () => {
    const payload: ConsentRecorded = { consent_version: "v1", ai: true, upload: false };
    const envelope = makeEnvelope("CONSENT_RECORDED", {
      session_id: sessionId,
      actor: "user",
      base_revision: 1,
      idempotency_key: `start-${sessionId}`, // reused from SESSION_STARTED
      payload,
    });

    const result = await commitEvent(sessionId, envelope);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("IDEMPOTENCY_CONFLICT");

    const events = await prisma.transitionEvent.findMany({ where: { sessionId } });
    expect(events.length).toBe(1);
  });

  it("rejects invalid state transitions", async () => {
    const envelope = makeEnvelope("WAVE_MISSION_COMMITTED", {
      session_id: sessionId,
      actor: "interviewer",
      base_revision: 1,
      idempotency_key: `invalid-transition-${sessionId}`,
      payload: {
        proposal_id: randomUUID(),
        generation_provenance: {
          id: randomUUID(),
          session_id: sessionId,
          proposal_id: randomUUID(),
          correlation_id: randomUUID(),
          prompt_contract_revision: 3,
          prompt_file_hash: "h",
          schema_hash: "h",
          context_builder_version: "v1",
          context_hash: "h",
          provider: "fixture",
          model: "fixture",
          model_config_json: {},
          model_config_hash: "h",
          fixture_suite_version: "v1",
          created_at: new Date().toISOString(),
        },
        wave: {} as any,
      } as any,
    });

    const result = await commitEvent(sessionId, envelope);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_STATE");
  });

  it("commits a sequence of ANSWER_SUBMITTED events as internal transitions", async () => {
    const start = makeEnvelope("SESSION_STARTED", {
      session_id: sessionId,
      actor: "system",
      base_revision: 0,
      idempotency_key: `start-2-${sessionId}`,
      payload: sessionStartedPayload,
    });
    await commitEvent(sessionId, start);

    const consentPayload: ConsentRecorded = { consent_version: "v1", ai: true, upload: false };
    const consent = makeEnvelope("CONSENT_RECORDED", {
      session_id: sessionId,
      actor: "user",
      base_revision: 1,
      idempotency_key: `consent-2-${sessionId}`,
      payload: consentPayload,
    });
    await commitEvent(sessionId, consent);

    const missionProvenanceId = randomUUID();
  const waveId = `w1-${sessionId.slice(-6)}`;
  const missionEnvelope = makeEnvelope("WAVE_MISSION_COMMITTED", {
    session_id: sessionId,
    actor: "interviewer",
    base_revision: 2,
    idempotency_key: `mission-2-${sessionId}`,
    payload: {
      proposal_id: randomUUID(),
      generation_provenance: {
        id: missionProvenanceId,
        session_id: sessionId,
        proposal_id: randomUUID(),
        correlation_id: randomUUID(),
        prompt_contract_revision: 3,
        prompt_file_hash: "h",
        schema_hash: "h",
        context_builder_version: "v1",
        context_hash: "h",
        provider: "fixture",
        model: "fixture",
        model_config_json: {},
        model_config_hash: "h",
        fixture_suite_version: "v1",
        created_at: new Date().toISOString(),
      },
      wave: {
        id: waveId,
        index: 1,
        kind: "core",
        mission: {
          id: `m1-${sessionId.slice(-6)}`,
          wave_id: waveId,
          generation_provenance_id: missionProvenanceId,
          decision_to_improve: "测试",
          target_dimensions: ["traits"],
          known_source_refs: [],
          important_unknown: "未知",
          why_now: "现在",
          exit_condition: "退出",
          sensitivity_ceiling: "ordinary",
        },
        status: "open",
        microbatches: [],
        asked_count: 0,
        elicitation_units: [],
        covered_unit_count: 0,
      },
    } as any,
  });
  const missionResult = await commitEvent(sessionId, missionEnvelope);
  expect(missionResult.ok).toBe(true);
  let base = 3;
  if (missionResult.ok) base = missionResult.nextRevision;

  for (let i = 0; i < 3; i++) {
      const answerId = randomUUID();
      const answerEnvelope = makeEnvelope("ANSWER_SUBMITTED", {
        session_id: sessionId,
        actor: "user",
        base_revision: base,
        idempotency_key: `answer-2-${sessionId}-${i}`,
        payload: {
          answer: {
            id: answerId,
            question_id: `q${i}`,
            source_ref: { source_id: answerId, source_revision: 1 },
            created_from: "card",
            skipped: false,
          },
          source: {
            source_id: answerId,
            session_id: sessionId,
            revision: 1,
            kind: "question_answer",
            created_at: new Date().toISOString(),
            untrusted: false,
            text_ref: `q${i}`,
          },
          coverage: [],
        } as any,
      });
      const result = await commitEvent(sessionId, answerEnvelope);
      expect(result.ok).toBe(true);
      if (result.ok) base = result.nextRevision;
    }

    const head = await prisma.sessionStateHead.findUnique({ where: { sessionId } });
    expect(head!.revision).toBe(6);
    const answers = await prisma.transitionEvent.count({
      where: { sessionId, eventType: "ANSWER_SUBMITTED" },
    });
    expect(answers).toBeGreaterThanOrEqual(3);
  });

  it("returns PERSISTENCE_ERROR and rolls back when a domain record cannot be written", async () => {
    const session = await prisma.session.create({
      data: {
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    const sid = session.id;

    try {
      const start = makeEnvelope("SESSION_STARTED", {
        session_id: sid,
        actor: "system",
        base_revision: 0,
        idempotency_key: `start-bad-${sid}`,
        payload: { guest_token_hash: "guest-" + randomUUID(), expires_at: new Date().toISOString() },
      });
      await commitEvent(sid, start);

      const consent = makeEnvelope("CONSENT_RECORDED", {
        session_id: sid,
        actor: "user",
        base_revision: 1,
        idempotency_key: `consent-bad-${sid}`,
        payload: { consent_version: "v1", ai: true, upload: false },
      });
      await commitEvent(sid, consent);

      const missionEnvelope = makeEnvelope("WAVE_MISSION_COMMITTED", {
        session_id: sid,
        actor: "interviewer",
        base_revision: 2,
        idempotency_key: `mission-bad-${sid}`,
        payload: {
          proposal_id: randomUUID(),
          generation_provenance: {
            id: randomUUID(),
            session_id: sid,
            proposal_id: randomUUID(),
            correlation_id: randomUUID(),
            prompt_contract_revision: 3,
            prompt_file_hash: "h",
            schema_hash: "h",
            context_builder_version: "v1",
            context_hash: "h",
            provider: "fixture",
            model: "fixture",
            model_config_json: {},
            model_config_hash: "h",
            fixture_suite_version: "v1",
            created_at: new Date().toISOString(),
          },
          wave: {
            id: `w1-${sid.slice(-6)}`,
            index: 1,
            kind: "core",
            mission: {
              id: `m1-${sid.slice(-6)}`,
              wave_id: `w1-${sid.slice(-6)}`,
              generation_provenance_id: randomUUID(),
              decision_to_improve: "测试",
              target_dimensions: ["traits"],
              known_source_refs: [],
              important_unknown: "未知",
              why_now: "现在",
              exit_condition: "退出",
              sensitivity_ceiling: "ordinary",
            },
            status: "open",
            microbatches: [],
            asked_count: 0,
            elicitation_units: [],
            covered_unit_count: 0,
          },
        } as any,
      });
      await commitEvent(sid, missionEnvelope);

      const answerId = randomUUID();
      const badAnswerEnvelope = makeEnvelope("ANSWER_SUBMITTED", {
        session_id: sid,
        actor: "user",
        base_revision: 3,
        idempotency_key: `answer-bad-${sid}`,
        payload: {
          answer: {
            id: answerId,
            question_id: "q1",
            source_ref: { source_id: answerId, source_revision: 1 },
            created_from: "card",
            skipped: false,
          },
          source: {
            source_id: answerId,
            session_id: "nonexistent-session",
            revision: 1,
            kind: "question_answer",
            created_at: new Date().toISOString(),
            untrusted: false,
            text_ref: "q1",
          },
          coverage: [],
        } as any,
      });

      const result = await commitEvent(sid, badAnswerEnvelope);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("PERSISTENCE_ERROR");

      // No TransitionEvent should have been written for the failed answer.
      const count = await prisma.transitionEvent.count({
        where: { sessionId: sid, eventType: "ANSWER_SUBMITTED" },
      });
      expect(count).toBe(0);

      // SessionStateHead should still be at revision 3.
      const head = await prisma.sessionStateHead.findUnique({ where: { sessionId: sid } });
      expect(head!.revision).toBe(3);
    } finally {
      await prisma.$transaction([
        prisma.transitionEvent.deleteMany({ where: { sessionId: sid } }),
        prisma.sessionStateHead.deleteMany({ where: { sessionId: sid } }),
        prisma.session.deleteMany({ where: { id: sid } }),
      ]);
    }
  });
});
