import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { postWaveSSE } from "./sse-helpers";

if ("loadEnvFile" in process) {
  (process as NodeJS.Process & { loadEnvFile(path: string): void }).loadEnvFile(".env");
}

const prisma = new PrismaClient();
const baseURL = "http://localhost:3000";

async function giveConsent(request: import("@playwright/test").APIRequestContext) {
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

async function postPortraitSSE(
  request: import("@playwright/test").APIRequestContext
): Promise<{ events: { type: string; data: unknown }[]; doneData: { portrait: Record<string, unknown> } | null }> {
  const res = await request.post(`${baseURL}/api/portrait`, {
    headers: { "content-type": "application/json" },
    data: JSON.stringify({}),
  });

  expect(res.status()).toBe(200);
  const body = await res.body();
  const text = body.toString("utf-8");

  const events: { type: string; data: unknown }[] = [];
  let doneData: { portrait: Record<string, unknown> } | null = null;

  const eventBlocks = text.split("\n\n");
  for (const block of eventBlocks) {
    const lines = block.split("\n");
    let eventType = "";
    let dataLine = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) eventType = line.slice(7);
      else if (line.startsWith("data: ")) dataLine = line.slice(6);
    }
    if (!eventType || !dataLine) continue;

    try {
      const data = JSON.parse(dataLine);
      events.push({ type: eventType, data });
      if (eventType === "done") doneData = data as { portrait: Record<string, unknown> };
    } catch {
      // ignore malformed
    }
  }

  return { events, doneData };
}

async function completeWave1(request: import("@playwright/test").APIRequestContext): Promise<void> {
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

  await postWaveSSE(request, baseURL, { wave_id: wave.wave_id, answers });
}

test.describe("Portrait generation", () => {
  test.setTimeout(60000);
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("POST /api/portrait returns SSE with partial and done events after Wave 1", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    await request.get(`${baseURL}/api/session`);
    await giveConsent(request);
    await completeWave1(request);

    const { events, doneData } = await postPortraitSSE(request);

    // Should have at least one partial event
    const partials = events.filter((e) => e.type === "partial");
    expect(partials.length).toBeGreaterThan(0);

    // Should have a done event with a portrait
    expect(doneData).not.toBeNull();
    expect(doneData!.portrait).toBeDefined();

    const portrait = doneData!.portrait as Record<string, any>;

    // Core fields
    expect(portrait.essence).toBeTruthy();
    expect(typeof portrait.essence).toBe("string");
    expect(portrait.trait_scales).toBeDefined();
    expect(Array.isArray(portrait.trait_scales)).toBe(true);
    expect(portrait.trait_scales.length).toBe(5);
    expect(portrait.trait_summary).toBeTruthy();
    expect(portrait.behavioral_patterns).toBeDefined();
    expect(Array.isArray(portrait.behavioral_patterns)).toBe(true);
    expect(portrait.radar_snapshot).toBeDefined();
    expect(portrait.radar_snapshot.length).toBe(6);

    // Host-decorated fields
    expect(portrait.id).toBeTruthy();
    expect(portrait.session_id).toBeTruthy();
    expect(portrait.generation_provenance_id).toBeTruthy();
    expect(portrait.generated_at).toBeTruthy();
    expect(portrait.status).toBe("generated");
  });

  test("GET /api/portrait returns persisted portrait after generation", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    await request.get(`${baseURL}/api/session`);
    await giveConsent(request);
    await completeWave1(request);

    // Generate
    const { doneData } = await postPortraitSSE(request);
    expect(doneData).not.toBeNull();
    const generatedId = doneData!.portrait.id;

    // Fetch via GET (idempotent)
    const getRes = await request.get(`${baseURL}/api/portrait`);
    expect(getRes.status()).toBe(200);
    const getData = await getRes.json();
    expect(getData.portrait).toBeDefined();
    expect(getData.portrait.id).toBe(generatedId);
  });

  test("POST /api/portrait is idempotent — second call returns same portrait without SSE", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    await request.get(`${baseURL}/api/session`);
    await giveConsent(request);
    await completeWave1(request);

    // First call: SSE stream
    const { doneData: firstDone } = await postPortraitSSE(request);
    expect(firstDone).not.toBeNull();

    // Second call: should return JSON directly (idempotent)
    const secondRes = await request.post(`${baseURL}/api/portrait`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({}),
    });
    expect(secondRes.status()).toBe(200);
    const secondData = await secondRes.json();
    expect(secondData.portrait).toBeDefined();
    expect(secondData.portrait.id).toBe(firstDone!.portrait.id);
  });

  test("POST /api/portrait returns 400 before any wave is completed", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    await request.get(`${baseURL}/api/session`);
    await giveConsent(request);

    // No wave completed yet
    const res = await request.post(`${baseURL}/api/portrait`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({}),
    });
    expect(res.status()).toBe(400);
  });

  test("GET /api/portrait returns 404 when no portrait has been generated", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    await request.get(`${baseURL}/api/session`);
    await giveConsent(request);
    await completeWave1(request);

    // No portrait generated yet
    const res = await request.get(`${baseURL}/api/portrait`);
    expect(res.status()).toBe(404);
  });
});
