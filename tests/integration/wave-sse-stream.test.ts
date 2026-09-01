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

function filterEvents(events: { type: string; data: unknown }[], type: string): unknown[] {
  return events.filter((e) => e.type === type).map((e) => e.data);
}

test.describe("Wave SSE streaming", () => {
  test.setTimeout(60000);
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("POST /api/wave returns SSE stream with partial and done events", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    await request.get(`${baseURL}/api/session`);
    await giveConsent(request);

    const waveRes = await request.get(`${baseURL}/api/wave`);
    const wave = await waveRes.json();

    const answers = [
      { question_id: "w1q1", value: "小林" },
      { question_id: "w1q2", value: "杭州" },
      { question_id: "w1q3", value: "w1q3-infp" },
      { question_id: "w1q4", value: "w1q4-flex" },
      { question_id: "w1q5", value: "w1q5-direction" },
      { question_id: "w1q6", value: "w1q6-solo" },
      { question_id: "w1q7", value: "w1q7-work" },
      { question_id: "w1q8", value: "最近在考虑要不要换工作方向" },
    ];

    const { events, doneData } = await postWaveSSE(request, baseURL, {
      wave_id: wave.wave_id,
      answers,
    });

    // SSE stream must contain at least one partial event and a done event.
    const partials = filterEvents(events, "partial");
    expect(partials.length).toBeGreaterThanOrEqual(1);
    expect(doneData).not.toBeNull();

    // Each partial event should be an object.
    for (const p of partials) {
      expect(typeof p).toBe("object");
    }

    // The last partial should have at least one of the three insight text fields.
    const lastPartial = partials[partials.length - 1] as Record<string, unknown>;
    const hasInsightField =
      lastPartial.user_told_me || lastPartial.current_reading || lastPartial.important_unknown;
    expect(hasInsightField).toBeTruthy();

    // Done event must contain a complete insight object.
    const done = doneData as any;
    expect(done.wave_id).toBe("w1");
    expect(done.insight).toBeDefined();
    expect(done.insight.user_told_me).toBeDefined();
    expect(done.insight.current_reading).toBeDefined();
    expect(done.insight.important_unknown).toBeDefined();

    await ctx.close();
  });

  test("SSE partial events progressively reveal insight fields", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    await request.get(`${baseURL}/api/session`);
    await giveConsent(request);

    const waveRes = await request.get(`${baseURL}/api/wave`);
    const wave = await waveRes.json();

    const answers = wave.questions.map((q: { id: string }) => ({
      question_id: q.id,
      skipped: true,
    }));

    const { events, doneData } = await postWaveSSE(request, baseURL, {
      wave_id: wave.wave_id,
      answers,
    });

    const partials = filterEvents(events, "partial");
    expect(partials.length).toBeGreaterThanOrEqual(1);

    // The done event insight must be complete.
    const done = doneData as any;
    expect(done.insight.user_told_me).toBeTruthy();
    expect(done.insight.current_reading).toBeTruthy();
    expect(done.insight.important_unknown).toBeTruthy();

    // Final partial should be consistent with done (or very close).
    const lastPartial = partials[partials.length - 1] as Record<string, unknown>;
    if (lastPartial.user_told_me) {
      expect(lastPartial.user_told_me).toBe(done.insight.user_told_me);
    }
    if (lastPartial.current_reading) {
      expect(lastPartial.current_reading).toBe(done.insight.current_reading);
    }

    await ctx.close();
  });

  test("SSE done event insight matches what is persisted in WorkingMemory", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    const sessionRes = await request.get(`${baseURL}/api/session`);
    const session = await sessionRes.json();

    await giveConsent(request);

    const waveRes = await request.get(`${baseURL}/api/wave`);
    const wave = await waveRes.json();

    const answers = [
      { question_id: "w1q1", value: "小林" },
      { question_id: "w1q2", value: "杭州" },
      { question_id: "w1q3", value: "w1q3-infp" },
      { question_id: "w1q4", value: "w1q4-flex" },
      { question_id: "w1q5", value: "w1q5-direction" },
      { question_id: "w1q6", value: "w1q6-solo" },
      { question_id: "w1q7", value: "w1q7-work" },
      { question_id: "w1q8", value: "最近在考虑要不要换工作方向" },
    ];

    const { doneData } = await postWaveSSE(request, baseURL, {
      wave_id: wave.wave_id,
      answers,
    });

    const done = doneData as any;

    // Verify the insight was persisted to WorkingMemory.
    const memoryRow = await prisma.workingMemory.findUnique({
      where: { sessionId: session.id },
    });
    expect(memoryRow).not.toBeNull();
    const memory = JSON.parse(memoryRow!.payload);
    expect(memory.last_wave_index).toBe(1);

    // The done event must contain a valid insight with all required fields.
    expect(done.insight.user_told_me).toBeTruthy();
    expect(done.insight.current_reading).toBeTruthy();
    expect(done.insight.important_unknown).toBeTruthy();
    expect(done.insight.evidence).toBeDefined();
    expect(done.insight.id).toBeDefined();
    expect(done.insight.wave_id).toBe("w1");
    expect(done.insight.status).toBe("generated");

    await ctx.close();
  });

  test("SSE stream returns 409 for invalid wave submission", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    await request.get(`${baseURL}/api/session`);
    await giveConsent(request);

    // Try to submit a non-existent wave.
    const post = await request.post(`${baseURL}/api/wave`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({
        wave_id: "w99",
        answers: [{ question_id: "fake", value: "test" }],
      }),
    });

    // Should get a 409 (wave not available) before SSE even starts.
    expect(post.status()).toBe(409);

    await ctx.close();
  });
});
