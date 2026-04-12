import { NextRequest, NextResponse } from "next/server";
import { SessionIdSchema } from "@/lib/schemas/session";
import { callLLM } from "@/lib/llm/client";
import { getSessionStore } from "@/lib/state/server/store-factory";
import { generateSession } from "@/lib/orchestration/generate-session";

// POST /api/sessions/[id]/generate
//
// Triggers LLM-based SessionGraph generation for a session that is in
// phase='brief'. Blocks until the 6-stage pipeline completes (30–90 seconds
// typical). Returns 200 with the updated session on success, or a typed error
// on failure.
//
// Phase transition: store.setGraph transitions phase → 'authoring'.
// Rate limiting and streaming are Phase 2B concerns; this route is blocking
// with the default Next.js serverless function timeout.

function logServerError(stage: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[sessions/generate] stage ${stage} failed: ${message}`);
}

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const idParse = SessionIdSchema.safeParse(params.id);
  if (!idParse.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid session ID." },
      { status: 400 }
    );
  }

  const store = getSessionStore();
  const session = await store.get(idParse.data);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Session not found." },
      { status: 404 }
    );
  }

  if (session.phase !== "brief") {
    return NextResponse.json(
      {
        ok: false,
        error: `Session must be in 'brief' phase to generate a graph; current phase: ${session.phase}`,
      },
      { status: 409 }
    );
  }

  if (!session.brief) {
    return NextResponse.json(
      { ok: false, error: "Session has no brief — call setBrief first." },
      { status: 400 }
    );
  }

  // Dev-mode fixture shortcut: POST /api/sessions/[id]/generate?mock=true
  // Uses a hand-authored fixture graph instead of running the 6-stage LLM
  // chain. Only works when NODE_ENV !== 'production'. Allows full-flow
  // browser testing without Scaleway credentials.
  const url = new URL(_request.url);
  if (url.searchParams.get("mock") === "true" && process.env.NODE_ENV !== "production") {
    const { makeGraph } = await import("@/tests/factories/graph-factory");
    const fixtureGraph = makeGraph({ brief: session.brief });
    const updated = await store.setGraph(idParse.data, fixtureGraph);
    return NextResponse.json({ ok: true, session: updated, warnings: ["Using fixture graph (mock=true)."] });
  }

  const result = await generateSession(session.brief, {
    callLLM,
    logger: logServerError,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, stage: result.stage, error: result.error },
      { status: 500 }
    );
  }

  const updated = await store.setGraph(idParse.data, result.graph);
  return NextResponse.json({ ok: true, session: updated, warnings: result.warnings });
}
