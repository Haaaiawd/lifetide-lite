import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import type { WorkingMemory } from "@/lib/working-memory/types";
import { rankActiveUncertainties } from "@/lib/interview/uncertainty";

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

function loadMemory(sessionId: string): Promise<WorkingMemory | null> {
  return prisma.workingMemory
    .findUnique({ where: { sessionId } })
    .then((row) => (row ? (JSON.parse(row.payload) as WorkingMemory) : null));
}

test.describe("Adaptive waves and deterministic stopping", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("Wave 2 focus is deterministic and questions are validated", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    const sessionRes = await request.get(`${baseURL}/api/session`);
    const session = await sessionRes.json();

    await giveConsent(request);

    const wave1Res = await request.get(`${baseURL}/api/wave`);
    const wave1 = await wave1Res.json();
    expect(wave1.wave_id).toBe("w1");
    expect(wave1.wave_index).toBe(1);

    const answers1 = [
      { question_id: "w1q1", value: "w1q1-b" },
      { question_id: "w1q2", value: ["w1q2-a", "w1q2-e"] },
      { question_id: "w1q3", value: "上周独自整理了一份流程文档，发现写完很有秩序感。" },
      { question_id: "w1q4", value: ["w1q4-a", "w1q4-b"] },
    ];

    const post1 = await request.post(`${baseURL}/api/wave`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ wave_id: wave1.wave_id, answers: answers1 }),
    });
    expect(post1.status()).toBe(201);

    // Submit accurate feedback so next ranking uses current uncertainty.
    await request.post(`${baseURL}/api/feedback`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({
        wave_id: "w1",
        verdict: "accurate",
        next_interest: "更想看看收入与时间的约束怎么平衡",
      }),
    });

    const memory = await loadMemory(session.id);
    expect(memory).not.toBeNull();
    const ranked = rankActiveUncertainties(memory!);
    expect(ranked.selectedId).not.toBeNull();

    const wave2Res = await request.get(`${baseURL}/api/wave`);
    const wave2 = await wave2Res.json();
    expect(wave2.wave_id).toBe("w2");
    expect(wave2.wave_index).toBe(2);
    expect(wave2.questions.length).toBeGreaterThanOrEqual(3);
    expect(wave2.questions.length).toBeLessThanOrEqual(5);
    expect(wave2.questions.some((q: any) => q.asks_for_concrete_example)).toBe(true);
    expect(wave2.focus_uncertainty_id).toBe(ranked.selectedId);

    for (const q of wave2.questions) {
      expect(q.wave_id).toBe("w2");
      expect(q.sensitivity).toMatch(/^(normal|sensitive)$/);
      if (q.sensitivity === "sensitive") {
        expect(q.why_this_matters).toBeTruthy();
      }
    }

    await ctx.close();
  });

  test("two-wave fixture path completes with exactly four first-attempt model calls", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    const sessionRes = await request.get(`${baseURL}/api/session`);
    const session = await sessionRes.json();

    await giveConsent(request);

    const wave1Res = await request.get(`${baseURL}/api/wave`);
    const wave1 = await wave1Res.json();

    const answers1 = [
      { question_id: "w1q1", value: "w1q1-b" },
      { question_id: "w1q2", value: ["w1q2-a", "w1q2-e"] },
      { question_id: "w1q3", value: "上周独自整理了一份流程文档，发现写完很有秩序感。" },
      { question_id: "w1q4", value: ["w1q4-a", "w1q4-b"] },
    ];

    await request.post(`${baseURL}/api/wave`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ wave_id: wave1.wave_id, answers: answers1 }),
    });

    await request.post(`${baseURL}/api/feedback`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({
        wave_id: "w1",
        verdict: "accurate",
        next_interest: "继续",
      }),
    });

    const wave2Res = await request.get(`${baseURL}/api/wave`);
    const wave2 = await wave2Res.json();
    expect(wave2.wave_id).toBe("w2");

    const answers2 = wave2.questions.map((q: any) => ({ question_id: q.id, value: `回答：${q.text.slice(0, 20)}` }));

    await request.post(`${baseURL}/api/wave`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ wave_id: wave2.wave_id, answers: answers2 }),
    });

    const stopRes = await request.get(`${baseURL}/api/wave`);
    const stop = await stopRes.json();
    expect(stop.stop).toBe(true);
    expect(stop.can_generate).toBe(true);
    expect(stop.provisional).toBe(false);

    const finalRes = await request.post(`${baseURL}/api/final`);
    expect(finalRes.status()).toBe(200);
    const finalPlan = await finalRes.json();
    expect(finalPlan.lives.length).toBe(3);

    const calls = await prisma.modelCallLog.findMany({
      where: { sessionId: session.id, status: "success" },
      orderBy: { createdAt: "asc" },
    });

    const businessCalls = calls.filter((c) =>
      ["sensemaker_wave", "interviewer", "sensemaker_final"].includes(c.purpose)
    );

    expect(businessCalls.length).toBe(4);
    expect(businessCalls.map((c) => c.purpose)).toEqual([
      "sensemaker_wave",
      "interviewer",
      "sensemaker_wave",
      "sensemaker_final",
    ]);

    await ctx.close();
  });

  test("committed question batch is preserved across retry/resume", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    const sessionRes = await request.get(`${baseURL}/api/session`);
    const session = await sessionRes.json();

    await giveConsent(request);

    const wave1Res = await request.get(`${baseURL}/api/wave`);
    const wave1 = await wave1Res.json();

    await request.post(`${baseURL}/api/wave`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({
        wave_id: wave1.wave_id,
        answers: wave1.questions.map((q: any) => ({ question_id: q.id, skipped: true })),
      }),
    });

    await request.post(`${baseURL}/api/feedback`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({
        wave_id: "w1",
        verdict: "accurate",
      }),
    });

    const first = await request.get(`${baseURL}/api/wave`);
    const firstData = await first.json();
    expect(firstData.wave_id).toBe("w2");

    const second = await request.get(`${baseURL}/api/wave`);
    const secondData = await second.json();
    expect(secondData.wave_id).toBe("w2");
    expect(JSON.stringify(secondData.questions)).toBe(JSON.stringify(firstData.questions));

    // Should not create a duplicate Wave 2.
    const waves = await prisma.wave.findMany({ where: { sessionId: session.id, wave_index: 2 } });
    expect(waves.length).toBe(1);

    await ctx.close();
  });

  test("state machine never creates Wave 5 or displays question 20", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    await request.get(`${baseURL}/api/session`);
    await giveConsent(request);

    const wave1Res = await request.get(`${baseURL}/api/wave`);
    const wave1 = await wave1Res.json();

    await request.post(`${baseURL}/api/wave`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({
        wave_id: wave1.wave_id,
        answers: wave1.questions.map((q: any) => ({ question_id: q.id, skipped: true })),
      }),
    });

    await request.post(`${baseURL}/api/feedback`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ wave_id: "w1", verdict: "accurate" }),
    });

    for (let i = 0; i < 4; i++) {
      const waveRes = await request.get(`${baseURL}/api/wave`);
      const wave = await waveRes.json();
      if (wave.stop) break;
      await request.post(`${baseURL}/api/wave`, {
        headers: { "content-type": "application/json" },
        data: JSON.stringify({
          wave_id: wave.wave_id,
          answers: wave.questions.map((q: any) => ({ question_id: q.id, skipped: true })),
        }),
      });
      await request.post(`${baseURL}/api/feedback`, {
        headers: { "content-type": "application/json" },
        data: JSON.stringify({ wave_id: wave.wave_id, verdict: "accurate" }),
      });
    }

    const waves = await prisma.wave.findMany({
      where: { sessionId: (await (await request.get(`${baseURL}/api/session`)).json()).id },
    });

    expect(waves.some((w) => w.wave_index >= 5)).toBe(false);

    const totalQuestions = await prisma.answer.count({
      where: { sessionId: (await (await request.get(`${baseURL}/api/session`)).json()).id },
    });
    expect(totalQuestions).toBeLessThanOrEqual(19);

    await ctx.close();
  });
});
