import { NextResponse } from "next/server";
import { resolveSession, hasConsent } from "@/lib/auth/resolve";
import { loadOrCreateWorkingMemory, saveWorkingMemory } from "@/lib/working-memory/store";
import { generatePortrait } from "@/lib/ai/sensemaker/portrait";
import type { PersonaPortraitProposal } from "@/lib/portrait/types";
import type { NextRequest } from "next/server";

// GET /api/portrait — return existing portrait if already generated (idempotent).
export async function GET(request: NextRequest) {
  const { session } = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  if (!hasConsent(session.consents, "ai")) {
    return NextResponse.json({ error: "AI consent required", missing: ["ai"] }, { status: 403 });
  }

  const memory = await loadOrCreateWorkingMemory(session.id);
  if (!memory.persona_portrait) {
    return NextResponse.json({ error: "Portrait not yet generated" }, { status: 404 });
  }

  return NextResponse.json({ portrait: memory.persona_portrait });
}

// POST /api/portrait — generate portrait via SSE stream.
// Returns text/event-stream with partial and done events.
export async function POST(request: NextRequest) {
  const { session } = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  if (!hasConsent(session.consents, "ai")) {
    return NextResponse.json({ error: "AI consent required", missing: ["ai"] }, { status: 403 });
  }

  const memory = await loadOrCreateWorkingMemory(session.id);

  if (memory.last_wave_index === 0) {
    return NextResponse.json(
      { error: "Complete at least Wave 1 before generating portrait" },
      { status: 400 }
    );
  }

  // Idempotent: if portrait already exists, return it directly.
  if (memory.persona_portrait) {
    return NextResponse.json({ portrait: memory.persona_portrait });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let controllerClosed = false;
      const safeClose = () => {
        if (controllerClosed) return;
        controllerClosed = true;
        try { controller.close(); } catch { /* already closed */ }
      };
      const sendSSE = (event: string, data: unknown) => {
        if (controllerClosed) return;
        try {
          const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        } catch {
          controllerClosed = true;
        }
      };

      try {
        const portrait = await generatePortrait(memory, {
          onPartial: (partial: Partial<PersonaPortraitProposal>) => {
            sendSSE("partial", partial);
          },
        });

        // Persist portrait into WorkingMemory.
        memory.persona_portrait = portrait;
        await saveWorkingMemory(session.id, memory);

        sendSSE("done", { portrait });
        safeClose();
      } catch (err) {
        console.error("Portrait SSE stream error:", err);
        sendSSE("error", { error: err instanceof Error ? err.message : "Unknown error" });
        safeClose();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
