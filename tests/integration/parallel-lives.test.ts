import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { postWaveSSE } from "./sse-helpers";
import type { FinalPlan, WorkingMemory } from "@/lib/working-memory/types";

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

async function runTwoWaves(request: any, sessionId: string) {
  const wave1Res = await request.get(`${baseURL}/api/wave`);
  const wave1 = await wave1Res.json();

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
    data: JSON.stringify({ wave_id: "w1", verdict: "accurate", next_interest: "继续" }),
  });

  const wave2Res = await request.get(`${baseURL}/api/wave`);
  const wave2 = await wave2Res.json();

  await postWaveSSE(request, baseURL, {
    wave_id: wave2.wave_id,
    answers: wave2.questions.map((q: any) => ({ question_id: q.id, value: `回答：${q.text.slice(0, 20)}` })),
  });

  const stopRes = await request.get(`${baseURL}/api/wave`);
  const stop = await stopRes.json();
  expect(stop.stop).toBe(true);
  expect(stop.can_generate).toBe(true);
  expect(stop.provisional).toBe(false);
  expect(stop.wave_index).toBeDefined();
}

test.describe("Parallel lives and prototype contract", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("FinalPlan matches the v2 ParallelLife schema and returns three equal lives", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    const sessionRes = await request.get(`${baseURL}/api/session`);
    const session = await sessionRes.json();

    await giveConsent(request);
    await runTwoWaves(request, session.id);

    // Generate portrait before final plan (required by API).
    const portraitRes = await request.post(`${baseURL}/api/portrait`);
    expect(portraitRes.status()).toBe(200);

    const finalRes = await request.post(`${baseURL}/api/final`);
    expect(finalRes.status()).toBe(200);
    const plan: FinalPlan = await finalRes.json();

    expect(plan.schema_version).toBe("parallel-lives.v3.ui");
    expect(plan.session_id).toBe(session.id);
    expect(plan.provisional).toBe(false);
    expect(plan.framing).toBeTruthy();
    expect(plan.lives.length).toBe(3);
    expect(plan.shared_values.length).toBeGreaterThanOrEqual(2);
    expect(plan.real_tradeoff).toBeTruthy();
    expect(plan.open_questions.length).toBeGreaterThanOrEqual(1);

    const memory = await loadMemory(session.id);
    expect(memory).not.toBeNull();
    const activeEvidenceIds = new Set(
      memory!.source_heads
        .filter((h) => h.status === "active")
        .map((h) => h.source_id)
    );

    for (const life of plan.lives) {
      expect(life.id).toBeTruthy();
      expect(life.title).toBeTruthy();
      expect(life.core_experience).toBeTruthy();
      expect(life.year_1).toBeTruthy();
      expect(life.year_2).toBeTruthy();
      expect(life.year_3).toBeTruthy();
      expect(life.ordinary_day).toBeTruthy();

      expect(life.attractions.length).toBeGreaterThanOrEqual(1);
      expect(life.costs_and_tradeoffs.length).toBeGreaterThanOrEqual(1);
      expect(life.evidence_for.length).toBeGreaterThanOrEqual(1);
      expect(life.uncertainties.length).toBeGreaterThanOrEqual(1);
      expect(life.risks.length).toBeGreaterThanOrEqual(1);

      for (const link of life.evidence_for) {
        expect(activeEvidenceIds.has(link.source_id)).toBe(true);
      }

      expect(life.trial.hypothesis).toBeTruthy();
      expect(life.trial.today_action).toBeTruthy();
      expect(life.trial.what_to_observe).toBeTruthy();
      expect(life.trial.day_1).toBeTruthy();
      expect(life.trial.day_2).toBeTruthy();
      expect(life.trial.day_3).toBeTruthy();
      expect(life.trial.time_ceiling_hours).toBeGreaterThanOrEqual(0.5);
      expect(life.trial.time_ceiling_hours).toBeLessThanOrEqual(6);
      expect(life.trial.money_ceiling).toBeTruthy();
      expect(life.trial.reversible_because).toBeTruthy();
      expect(life.trial.feedback_source).toBeTruthy();
      expect(life.trial.continue_signal).toBeTruthy();
      expect(life.trial.pause_or_exit_note).toBeTruthy();
      expect(life.trial.safety_check).toBeTruthy();

      const trialText = Object.values(life.trial).filter((v) => typeof v === "string").join(" ");
      expect(trialText).not.toMatch(/辞职|退学|搬家|贷款|手术|分手|公开宣布|卖房/);
    }

    await ctx.close();
  });

  test("Three lives are pairwise distinct and no ranking language is used", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    await request.get(`${baseURL}/api/session`);
    await giveConsent(request);
    await runTwoWaves(request, "");

    const finalRes = await request.post(`${baseURL}/api/final`);
    const plan: FinalPlan = await finalRes.json();

    const [a, b, c] = plan.lives;
    const summary = (life: typeof a) => `${life.title} ${life.core_experience} ${life.ordinary_day} ${life.year_1}`;

    expect(summary(a)).not.toBe(summary(b));
    expect(summary(b)).not.toBe(summary(c));
    expect(summary(a)).not.toBe(summary(c));

    const allText = JSON.stringify(plan);
    expect(allText).not.toMatch(/最佳|最适合|推荐|首选|冠军|plan b|b 计划|最安全/i);

    await ctx.close();
  });

  test("Final plan can be generated after Wave 1 with portrait", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    const sessionRes = await request.get(`${baseURL}/api/session`);
    const session = await sessionRes.json();

    await giveConsent(request);

    const wave1 = await (await request.get(`${baseURL}/api/wave`)).json();
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
        { question_id: "w1q8", value: "有能量的时刻和消耗的片段" },
      ],
    });

    // Generate portrait before final plan (required by API).
    const portraitRes = await request.post(`${baseURL}/api/portrait`);
    expect(portraitRes.status()).toBe(200);

    const finalRes = await request.post(`${baseURL}/api/final`);
    expect(finalRes.status()).toBe(200);
    const plan: FinalPlan = await finalRes.json();

    expect(plan.provisional).toBe(false);
    expect(plan.lives.length).toBe(3);
    expect(plan.lives[0].evidence_for.length).toBeGreaterThanOrEqual(1);

    // Plans should still be distinct.
    const [x, y, z] = plan.lives;
    expect(`${x.title} ${x.year_1}`).not.toBe(`${y.title} ${y.year_1}`);
    expect(`${y.title} ${y.year_1}`).not.toBe(`${z.title} ${z.year_1}`);

    await ctx.close();
  });
});
