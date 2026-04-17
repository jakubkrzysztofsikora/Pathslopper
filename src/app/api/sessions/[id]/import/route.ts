import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SessionIdSchema } from "@/lib/schemas/session";
import { callLLM } from "@/lib/llm/client";
import { getSessionStore } from "@/lib/state/server/store-factory";
import { importSession } from "@/lib/orchestration/import/import-session";

// POST /api/sessions/[id]/import
//
// Parses user-supplied Markdown session notes into a SessionGraph via the
// six-stage extract-or-fill LLM pipeline and stores the result. Phase
// transitions to 'authoring'. Blocks until the pipeline completes (similar
// timing to /generate).
//
// Re-import rules:
//   phase='brief'     → imports freely
//   phase='authoring' → requires ?confirm=overwrite query param; without it,
//                       returns 409 with a preview of the existing graph so
//                       the UI can prompt the GM before overwriting edits.
//   phase='approved' or later → blocked (409); user must create a new session.
//
// Large pastes: capped at 50k chars by the orchestrator. For larger files
// clients should upload via presigned URL (reuses character-sheet pattern).

const BodySchema = z.object({
  content: z.string().optional(),
  uploadKey: z.string().optional(),
  consent: z
    .object({
      clocks: z.boolean().optional(),
      fronts: z.boolean().optional(),
      endings: z.boolean().optional(),
    })
    .optional(),
});

function logServerError(stage: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[sessions/import] stage ${stage} failed: ${message}`);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const idParse = SessionIdSchema.safeParse(params.id);
  if (!idParse.success) {
    return NextResponse.json({ ok: false, error: "Invalid session ID." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const bodyParse = BodySchema.safeParse(body);
  if (!bodyParse.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request payload.", details: bodyParse.error.errors },
      { status: 400 }
    );
  }

  if (!bodyParse.data.content && !bodyParse.data.uploadKey) {
    return NextResponse.json(
      { ok: false, error: "Missing content or uploadKey." },
      { status: 400 }
    );
  }

  const store = getSessionStore();
  const session = await store.get(idParse.data);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  }

  // Phase gating for re-import
  if (session.phase === "approved" || session.phase === "playing" || session.phase === "ended") {
    return NextResponse.json(
      {
        ok: false,
        error: `Session is already approved (phase=${session.phase}); start a new session to import fresh content.`,
      },
      { status: 409 }
    );
  }

  const url = new URL(request.url);
  const confirm = url.searchParams.get("confirm");
  if (session.phase === "authoring" && confirm !== "overwrite") {
    const existing = session.graph;
    return NextResponse.json(
      {
        ok: false,
        error:
          "Session already has a graph. Re-import will overwrite existing edits. " +
          "Re-send this request with ?confirm=overwrite to proceed.",
        existingGraph: existing
          ? {
              nodeCount: existing.nodes.length,
              titles: existing.nodes.slice(0, 10).map((n) => n.title),
            }
          : null,
      },
      { status: 409 }
    );
  }

  // Resolve content. For uploadKey, fetch the object from Scaleway Object
  // Storage (same pattern as /api/character-sheet). Left as TODO for a
  // follow-up — client-side paste is the primary path in v1.
  let raw: string;
  if (bodyParse.data.content) {
    raw = bodyParse.data.content;
  } else {
    return NextResponse.json(
      { ok: false, error: "uploadKey import is not yet implemented; use content field." },
      { status: 400 }
    );
  }

  const result = await importSession(
    { raw, consent: bodyParse.data.consent },
    { callLLM, logger: logServerError }
  );

  if (!result.ok) {
    const status = result.stage === "input" ? 400 : 500;
    return NextResponse.json(
      { ok: false, stage: result.stage, error: result.error },
      { status }
    );
  }

  const updated = await store.setGraph(idParse.data, result.graph);
  return NextResponse.json({
    ok: true,
    session: updated,
    graph: result.graph,
    warnings: result.warnings,
    pendingConsent: result.pendingConsent,
    repairs: result.repairs,
  });
}
