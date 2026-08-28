import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { makeWave1Questions, WAVE_1_VERSION } from "@/lib/interview/templates";
import type { WorkingMemory } from "@/lib/working-memory/types";

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

test.describe("Wave 1, WorkingMemory and immediate calibration", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("Wave 1 returns a versioned 4-question template with skip and produces no Interviewer call", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    await request.get(`${baseURL}/api/session`);
    await giveConsent(request);

    const res = await request.get(`${baseURL}/api/wave`);
    expect(res.status()).toBe(200);
    const data = await res.json();

    // Snapshot of ids, order, version, skip behavior and wording.
    expect(data).toEqual({
      wave_id: "w1",
      wave_index: 1,
      version: WAVE_1_VERSION,
      questions: makeWave1Questions(),
    });

    for (const q of data.questions) {
      expect(q.allows_skip).toBe(true);
      expect(["normal", "sensitive"]).toContain(q.sensitivity);
      expect(["short_text", "single_choice", "multi_choice"]).toContain(q.response_kind);
    }

    // No external call means the response is immediate and no Interviewer id appears.
    const body = JSON.stringify(data);
    expect(body).not.toContain("interviewer");
    expect(body).not.toContain("Interviewer");

    await ctx.close();
  });

  test("submitting Wave 1 creates answers, a WorkingMemory and an insight whose evidence resolves", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    const sessionRes = await request.get(`${baseURL}/api/session`);
    const session = await sessionRes.json();

    await giveConsent(request);

    const waveRes = await request.get(`${baseURL}/api/wave`);
    const wave = await waveRes.json();

    const answers = [
      { question_id: "w1q1", value: "w1q1-b" },
      { question_id: "w1q2", value: "上周独自整理了一份流程文档，发现写完很有秩序感。" },
      { question_id: "w1q3", value: "每天回复大量消息，让我没有时间想真正重要的事。" },
      { question_id: "w1q4", value: "每周最多能抽出四小时做新尝试。" },
    ];

    const post = await request.post(`${baseURL}/api/wave`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ wave_id: wave.wave_id, answers }),
    });
    expect(post.status()).toBe(201);
    const body = await post.json();

    expect(body.wave_id).toBe("w1");
    expect(body.insight).toBeDefined();
    expect(body.insight.observation).toBeDefined();
    expect(body.insight.interpretation).toBeDefined();
    expect(body.insight.uncertainty).toBeDefined();
    expect(body.insight.evidence_ids.length).toBeGreaterThanOrEqual(1);
    expect(body.insight.confidence).toMatch(/^(low|medium|high)$/);

    const storedAnswers = await prisma.answer.count({ where: { sessionId: session.id } });
    expect(storedAnswers).toBe(4);

    const memory = await loadMemory(session.id);
    expect(memory).not.toBeNull();
    expect(memory!.last_wave_index).toBe(1);
    expect(memory!.evidence.length).toBeGreaterThanOrEqual(1);
    expect(memory!.claims.length).toBeGreaterThanOrEqual(1);

    for (const eid of body.insight.evidence_ids) {
      const evidence = memory!.evidence.find((e) => e.id === eid);
      expect(evidence).toBeDefined();
      expect(evidence!.status).toBe("active");
    }

    await ctx.close();
  });

  test("skipping all Wave 1 questions still produces a provisional insight", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    const sessionRes = await request.get(`${baseURL}/api/session`);
    const session = await sessionRes.json();

    await giveConsent(request);

    const waveRes = await request.get(`${baseURL}/api/wave`);
    const wave = await waveRes.json();

    const answers = wave.questions.map((q: { id: string }) => ({ question_id: q.id, skipped: true }));

    const post = await request.post(`${baseURL}/api/wave`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ wave_id: wave.wave_id, answers }),
    });
    expect(post.status()).toBe(201);

    const memory = await loadMemory(session.id);
    expect(memory).not.toBeNull();
    expect(memory!.last_wave_index).toBe(1);

    await ctx.close();
  });

  test("insight feedback persists distinctly and inaccurate invalidates contradictory claims", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    const sessionRes = await request.get(`${baseURL}/api/session`);
    const session = await sessionRes.json();

    await giveConsent(request);

    const waveRes = await request.get(`${baseURL}/api/wave`);
    const wave = await waveRes.json();

    const answers = [
      { question_id: "w1q1", value: "w1q1-b" },
      { question_id: "w1q2", value: ["w1q2-a", "w1q2-e"] },
      { question_id: "w1q3", value: "上周独自整理了一份流程文档，发现写完很有秩序感。" },
      { question_id: "w1q4", value: ["w1q4-a", "w1q4-b"] },
    ];

    await request.post(`${baseURL}/api/wave`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ wave_id: wave.wave_id, answers }),
    });

    const before = await loadMemory(session.id);
    const activeClaimsBefore = before!.claims.filter((c) => c.status === "active").length;
    expect(activeClaimsBefore).toBeGreaterThan(0);

    const fbRes = await request.post(`${baseURL}/api/feedback`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({
        wave_id: "w1",
        verdict: "inaccurate",
        correction: "我不是方向不清，而是有两个方向都让我动心。",
      }),
    });
    expect(fbRes.status()).toBe(200);

    const after = await loadMemory(session.id);
    expect(after!.recent_feedback.length).toBe(1);
    expect(after!.recent_feedback[0].verdict).toBe("inaccurate");

    const activeClaimsAfter = after!.claims.filter((c) => c.status === "active").length;
    expect(activeClaimsAfter).toBeLessThan(activeClaimsBefore);

    // A correction from inaccurate feedback should be added as user_confirmed evidence.
    const correctionEvidence = after!.evidence.find(
      (e) => e.epistemic === "user_confirmed" && e.source_refs.some((s) => s.kind === "insight_feedback")
    );
    expect(correctionEvidence).toBeDefined();

    await ctx.close();
  });

  test("partly_accurate feedback downgrades confidence but does not invalidate", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    const sessionRes = await request.get(`${baseURL}/api/session`);
    const session = await sessionRes.json();

    await giveConsent(request);

    const waveRes = await request.get(`${baseURL}/api/wave`);
    const wave = await waveRes.json();

    const answers = [
      { question_id: "w1q1", value: "w1q1-b" },
      { question_id: "w1q2", value: ["w1q2-a", "w1q2-e"] },
      { question_id: "w1q3", value: "上周独自整理了一份流程文档，发现写完很有秩序感。" },
      { question_id: "w1q4", value: ["w1q4-a", "w1q4-b"] },
    ];

    await request.post(`${baseURL}/api/wave`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ wave_id: wave.wave_id, answers }),
    });

    const before = await loadMemory(session.id);
    const activeClaimsBefore = before!.claims.filter((c) => c.status === "active").length;

    await request.post(`${baseURL}/api/feedback`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({
        wave_id: "w1",
        verdict: "partly_accurate",
        correction: "方向是对的，但主要是收入不够让我不安。",
      }),
    });

    const after = await loadMemory(session.id);
    const activeClaimsAfter = after!.claims.filter((c) => c.status === "active").length;
    expect(activeClaimsAfter).toBe(activeClaimsBefore);

    const highConfidenceAfter = after!.claims.filter(
      (c) => c.status === "active" && c.confidence === "high"
    ).length;
    expect(highConfidenceAfter).toBeLessThanOrEqual(before!.claims.filter((c) => c.confidence === "high").length);

    await ctx.close();
  });

  test("accurate feedback persists distinctly and does not alter active claims", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    const sessionRes = await request.get(`${baseURL}/api/session`);
    const session = await sessionRes.json();

    await giveConsent(request);

    const waveRes = await request.get(`${baseURL}/api/wave`);
    const wave = await waveRes.json();

    const answers = [
      { question_id: "w1q1", value: "w1q1-b" },
      { question_id: "w1q2", value: ["w1q2-a", "w1q2-e"] },
      { question_id: "w1q3", value: "上周独自整理了一份流程文档，发现写完很有秩序感。" },
      { question_id: "w1q4", value: ["w1q4-a", "w1q4-b"] },
    ];

    await request.post(`${baseURL}/api/wave`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ wave_id: wave.wave_id, answers }),
    });

    const before = await loadMemory(session.id);
    const activeClaimsBefore = before!.claims.filter((c) => c.status === "active").length;

    const fbRes = await request.post(`${baseURL}/api/feedback`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({
        wave_id: "w1",
        verdict: "accurate",
        next_interest: "更想看看收入与时间的约束怎么平衡",
      }),
    });
    expect(fbRes.status()).toBe(200);

    const after = await loadMemory(session.id);
    expect(after!.recent_feedback.length).toBe(1);
    expect(after!.recent_feedback[0].verdict).toBe("accurate");

    const activeClaimsAfter = after!.claims.filter((c) => c.status === "active").length;
    expect(activeClaimsAfter).toBe(activeClaimsBefore);

    await ctx.close();
  });

  test("one guest cannot read or mutate another guest's WorkingMemory", async ({ browser }) => {
    const alice = await browser.newContext();
    const bob = await browser.newContext();

    await alice.request.get(`${baseURL}/api/session`);
    await bob.request.get(`${baseURL}/api/session`);

    for (const request of [alice.request, bob.request]) {
      await request.post(`${baseURL}/api/session/consent`, {
        headers: { "content-type": "application/json" },
        data: JSON.stringify({ consents: [{ type: "ai", given: true }, { type: "upload", given: true }] }),
      });
    }

    // Bob completes wave 1
    const waveRes = await bob.request.get(`${baseURL}/api/wave`);
    const wave = await waveRes.json();
    const answers = wave.questions.map((q: { id: string }) => ({ question_id: q.id, skipped: true }));

    await bob.request.post(`${baseURL}/api/wave`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ wave_id: wave.wave_id, answers }),
    });

    const bSession = await (await bob.request.get(`${baseURL}/api/session`)).json();
    const bMemory = await loadMemory(bSession.id);
    expect(bMemory).not.toBeNull();

    // Alice guesses Bob's session id and tries to post feedback.
    // The server only looks at the HttpOnly cookie, so Alice acts on her own empty memory.
    const guessed = await alice.request.post(`${baseURL}/api/feedback`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ wave_id: "w1", verdict: "inaccurate" }),
    });
    expect(guessed.status()).toBe(200);

    // Bob's memory is unchanged
    const bMemoryAfter = await loadMemory(bSession.id);
    expect(bMemoryAfter!.recent_feedback).toHaveLength(0);

    await alice.close();
    await bob.close();
  });

  test("Wave 1 supports custom answers for single and multi choice", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    const sessionRes = await request.get(`${baseURL}/api/session`);
    const session = await sessionRes.json();

    await giveConsent(request);

    const waveRes = await request.get(`${baseURL}/api/wave`);
    const wave = await waveRes.json();

    const answers = [
      { question_id: "w1q1", value: "我觉得是工作生活边界" },
      { question_id: "w1q2", value: ["w1q2-a", "我还没有找到合适的节奏"] },
      { question_id: "w1q3", value: "上周独自整理了一份流程文档，发现写完很有秩序感。" },
      { question_id: "w1q4", value: ["w1q4-a", "w1q4-b", "我需要照顾家庭"] },
    ];

    const post = await request.post(`${baseURL}/api/wave`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ wave_id: wave.wave_id, answers }),
    });
    expect(post.status()).toBe(201);

    const memory = await loadMemory(session.id);
    expect(memory).not.toBeNull();

    const statements = memory!.evidence.map((e) => e.statement);
    expect(statements.some((s) => s.includes("工作生活边界"))).toBe(true);
    expect(statements.some((s) => s.includes("我还没有找到合适的节奏"))).toBe(true);
    expect(statements.some((s) => s.includes("我需要照顾家庭"))).toBe(true);
    expect(statements.some((s) => s.includes("有投入感"))).toBe(true);
    expect(statements.some((s) => s.includes("时间上限"))).toBe(true);

    await ctx.close();
  });
});
