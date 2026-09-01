import { expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

type SSEEvent = { type: string; data: unknown };

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
  const body = await res.body();
  const text = body.toString("utf-8");

  const events: SSEEvent[] = [];
  let doneData: any = null;

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
      if (eventType === "done") doneData = data;
    } catch {
      // ignore malformed
    }
  }

  if (!doneData) throw new Error("SSE stream ended without done event");
  return { events, doneData };
}
