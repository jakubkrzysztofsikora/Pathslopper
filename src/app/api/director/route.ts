import { NextRequest, NextResponse } from "next/server";
import { SessionIdSchema } from "@/lib/schemas/session";
import { getSessionStore } from "@/lib/state/server/store-factory";
import { callLLM } from "@/lib/llm/client";
import { director } from "@/lib/orchestration/director/director";
import { z } from "zod";

// POST /api/director
// Central play-time Director endpoint. Accepts DirectorInput and returns DirectorOutput.

const DirectorInputSchema = z.object({
  type: z.enum(["start", "continue", "choice", "player-input", "skip"]),
  choiceIndex: z.number().int().min(0).optional(),
  playerInput: z.string().max(500).optional(),
  characterName: z.string().max(80).optional(),
});

const BodySchema = z.object({
  sessionId: SessionIdSchema,
  input: DirectorInputSchema,
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const bodyParse = BodySchema.safeParse(body);
  if (!bodyParse.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request.", details: bodyParse.error.errors },
      { status: 400 }
    );
  }

  const { sessionId, input } = bodyParse.data;
  const store = getSessionStore();
  const session = await store.get(sessionId);

  if (!session) {
    return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  }

  if (session.phase !== "approved" && session.phase !== "playing") {
    return NextResponse.json(
      { ok: false, error: `Director requires 'approved' or 'playing' phase; current: ${session.phase}` },
      { status: 409 }
    );
  }

  try {
    const output = await director(input, { callLLM, store, sessionId });
    return NextResponse.json({ ok: true, output });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[director route] error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
