import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SessionIdSchema } from "@/lib/schemas/session";
import { callLLM } from "@/lib/llm/client";
import { narrateScene } from "@/lib/orchestration/narrate-scene";
import { getSessionStore } from "@/lib/state/server/session-store";

// Thin HTTP adapter for Phase 1 (Narration). The orchestration and the
// server-owned session store both live in src/lib/, per the state
// boundary and orchestration rules in CLAUDE.md.

// Scene seeds are interpolated into the narrator user prompt. Reject
// control characters and backticks as a basic prompt-injection guard.
const SCENE_SEED = z
  .string()
  .trim()
  .min(1)
  .max(400)
  // eslint-disable-next-line no-control-regex
  .regex(/^[^\x00-\x1f`]+$/, "sceneSeed contains control characters or backticks.");

const RequestSchema = z.object({
  sessionId: SessionIdSchema,
  sceneSeed: SCENE_SEED.optional(),
  /** When true, the narration is appended to the session log as a NarrationTurn. */
  persist: z.boolean().optional(),
});

function logServerError(stage: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[interaction/narrate] ${stage} failed: ${message}`);
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { sessionId, sceneSeed, persist } = parsed.data;
  const store = getSessionStore();
  const session = store.get(sessionId);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: `Unknown session: ${sessionId}` },
      { status: 404 }
    );
  }

  const worldStateHash = store.worldStateHash(sessionId);
  if (!worldStateHash) {
    // Can only happen if the session was deleted between the two reads
    // above — treat as a 404 for client simplicity.
    return NextResponse.json(
      { ok: false, error: `Session no longer exists: ${sessionId}` },
      { status: 404 }
    );
  }

  const narration = await narrateScene(
    { session, worldStateHash, sceneSeed },
    { callLLM, logger: logServerError }
  );

  if (!narration.ok) {
    return NextResponse.json(
      { ok: false, error: narration.error },
      { status: 502 }
    );
  }

  let updatedSession = session;
  if (persist) {
    const appended = store.appendNarration(sessionId, narration.markdown);
    if (appended) updatedSession = appended;
  }

  return NextResponse.json({
    ok: true,
    markdown: narration.markdown,
    warnings: narration.warnings,
    worldStateHash: narration.worldStateHash,
    session: updatedSession,
  });
}
