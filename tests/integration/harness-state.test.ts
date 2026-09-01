import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { postWaveSSE } from "./sse-helpers";

if ("loadEnvFile" in process) {
  (process as NodeJS.Process & { loadEnvFile(path: string): void }).loadEnvFile(".env");
}

const prisma = new PrismaClient();
const baseURL = "http://localhost:3000";

async function giveConsent(request: any) {
  const res = await request.post(`${baseURL}/api/session/consent`, {
    headers: { "content-type": "application/json" },
    data: JSON.stringify({
      consents: [
        { type: "ai", given: true },
        { type: "upload", given: true },
      ],
    }),
  });
  expect(res.status()).toBe(200);
}

test.describe("XState ledger end-to-end", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("a complete two-wave + final plan flow writes a revision-safe, monotonic ledger", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    const sessionRes = await request.get(`${baseURL}/api/session`);
    expect(sessionRes.status()).toBe(200);
    const session = await sessionRes.json();

    await giveConsent(request);

    const wave1Res = await request.get(`${baseURL}/api/wave`);
    expect(wave1Res.status()).toBe(200);
    const wave1 = await wave1Res.json();
    expect(wave1.wave_index).toBe(1);

    await postWaveSSE(request, baseURL, {
      wave_id: wave1.wave_id,
      answers: [
        { question_id: "w1q1", value: "小林" },
        { question_id: "w1q2", value: "杭州" },
        { question_id: "w1q3", value: "w1q3-infp" },
        { question_id: "w1q4", value: "w1q4-flex" },
        { question_id: "w1q5", value: "w1q5-direction" },
        { question_id: "w1q6", value: "w1q6-solo" },
        { question_id: "w1q7", value: "w1q7-work" },
        { question_id: "w1q8", value: "最近在考虑要不要换工作方向" },
      ],
    });

    await request.post(`${baseURL}/api/feedback`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ wave_id: wave1.wave_id, verdict: "accurate", next_interest: "继续" }),
    });

    const wave2Res = await request.get(`${baseURL}/api/wave`);
    expect(wave2Res.status()).toBe(200);
    const wave2 = await wave2Res.json();
    expect(wave2.wave_index).toBe(2);

    await postWaveSSE(request, baseURL, {
      wave_id: wave2.wave_id,
      answers: wave2.questions.map((q: any) => ({ question_id: q.id, value: `回答：${q.text.slice(0, 20)}` })),
    });

    const stopRes = await request.get(`${baseURL}/api/wave`);
    const stop = await stopRes.json();
    expect(stop.stop).toBe(true);
    expect(stop.can_generate).toBe(true);

    const finalRes = await request.post(`${baseURL}/api/final`);
    expect(finalRes.status()).toBe(200);
    const plan = await finalRes.json();
    expect(plan.lives).toHaveLength(3);

    // Ledger assertions.
    const head = await prisma.sessionStateHead.findUnique({ where: { sessionId: session.id } });
    expect(head).not.toBeNull();
    expect(head!.machineVersion).toBe(3);
    expect(head!.revision).toBeGreaterThanOrEqual(10);

    const events = await prisma.transitionEvent.findMany({
      where: { sessionId: session.id },
      orderBy: { committedRevision: "asc" },
    });

    const eventTypes = events.map((e) => e.eventType);
    expect(eventTypes[0]).toBe("SESSION_STARTED");
    expect(eventTypes[1]).toBe("CONSENT_RECORDED");
    expect(eventTypes).toContain("WAVE_MISSION_COMMITTED");
    expect(eventTypes).toContain("ANSWER_SUBMITTED");
    expect(eventTypes).toContain("WAVE_END_COMMITTED");
    expect(eventTypes).toContain("INSIGHT_COMMITTED");
    expect(eventTypes).toContain("CALIBRATION_SUBMITTED");
    expect(eventTypes).toContain("ROUTE_PHASE_ENTERED");
    expect(eventTypes).toContain("ROUTE_INTENT_CANDIDATES_COMMITTED");
    expect(eventTypes).toContain("PARALLEL_LIVES_COMMITTED");

    // Revision monotonic and exactly +1 from base.
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      expect(e.committedRevision).toBe(e.baseRevision + 1);
      if (i > 0) {
        expect(e.baseRevision).toBe(events[i - 1].committedRevision);
      }
    }

    // Idempotency keys and event ids are unique within the session.
    const keys = new Set(events.map((e) => e.idempotencyKey));
    expect(keys.size).toBe(events.length);

    const ids = new Set(events.map((e) => e.eventId));
    expect(ids.size).toBe(events.length);

    await ctx.close();
  });
});
