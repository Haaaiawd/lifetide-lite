import { expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import type { FinalPlan } from "@/lib/working-memory/types";
import type { PersonaPortrait } from "@/lib/portrait/types";

type SSEEvent = { type: string; data: unknown };

function parseSseBody(body: Buffer): SSEEvent[] {
  const text = body.toString("utf-8");
  const events: SSEEvent[] = [];

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
    } catch {
      // ignore malformed
    }
  }

  return events;
}

/**
 * Posts to /api/wave via Playwright and parses the SSE response body.
 * Playwright's APIRequestContext buffers the full response, so this is not
 * a true streaming test — but it validates the SSE event structure, partial
 * events, and done event payload.
 *
 * In fixture mode the AI returns instantly, so streaming vs buffered makes
 * no difference. With a real provider, the events are still collected in order.
 */
export async function postWaveSSE(
  request: APIRequestContext,
  baseURL: string,
  payload: { wave_id: string; answers: Array<{ question_id: string; value?: string | string[] | number; skipped?: boolean }> }
): Promise<{ events: SSEEvent[]; doneData: { wave_id: string; wave_index: number; revision: number; insight: Record<string, unknown> } }> {
  const res = await request.post(`${baseURL}/api/wave`, {
    headers: { "content-type": "application/json" },
    data: JSON.stringify(payload),
  });

  expect(res.status()).toBe(200);
  const events = parseSseBody(await res.body());
  const doneData = events.find((e) => e.type === "done")?.data as { wave_id: string; wave_index: number; revision: number; insight: Record<string, unknown> } | undefined;

  if (!doneData) throw new Error("SSE stream ended without done event");
  return { events, doneData };
}

/**
 * Posts to /api/portrait and parses the SSE response body.
 */
export async function postPortraitSSE(
  request: APIRequestContext,
  baseURL: string
): Promise<{ events: SSEEvent[]; doneData: { portrait: PersonaPortrait } }> {
  const res = await request.post(`${baseURL}/api/portrait`, {
    headers: { "content-type": "application/json" },
    data: JSON.stringify({}),
  });

  expect(res.status()).toBe(200);
  const events = parseSseBody(await res.body());
  const doneData = events.find((e) => e.type === "done")?.data as { portrait: PersonaPortrait } | undefined;

  if (!doneData) throw new Error("Portrait SSE stream ended without done event");
  return { events, doneData };
}

/**
 * Posts to /api/final and parses the SSE response body.
 */
export async function postFinalSSE(
  request: APIRequestContext,
  baseURL: string
): Promise<{ events: SSEEvent[]; doneData: FinalPlan }> {
  const res = await request.post(`${baseURL}/api/final`, {
    headers: { "content-type": "application/json" },
    data: JSON.stringify({}),
  });

  expect(res.status()).toBe(200);
  const events = parseSseBody(await res.body());
  const doneData = events.find((e) => e.type === "done")?.data as FinalPlan | undefined;

  if (!doneData) throw new Error("Final plan SSE stream ended without done event");
  return { events, doneData };
}
