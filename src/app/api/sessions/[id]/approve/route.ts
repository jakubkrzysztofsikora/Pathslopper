import { NextRequest, NextResponse } from "next/server";
import { SessionIdSchema } from "@/lib/schemas/session";
import { getSessionStore } from "@/lib/state/server/store-factory";
import { compileGraph } from "@/lib/orchestration/director/ink";

// POST /api/sessions/[id]/approve
// Compiles the session graph with inkjs and transitions phase → approved.

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const idParse = SessionIdSchema.safeParse(params.id);
  if (!idParse.success) {
    return NextResponse.json({ ok: false, error: "Invalid session ID." }, { status: 400 });
  }

  const store = getSessionStore();
  const session = await store.get(idParse.data);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  }

  if (session.phase !== "authoring") {
    return NextResponse.json(
      { ok: false, error: `Session must be in 'authoring' phase to approve; current: ${session.phase}` },
      { status: 409 }
    );
  }

  if (!session.graph) {
    return NextResponse.json(
      { ok: false, error: "Session has no graph to compile." },
      { status: 400 }
    );
  }

  let compiledJson: string;
  let warnings: string[];
  try {
    const result = await compileGraph(session.graph);
    compiledJson = result.compiledJson;
    warnings = result.warnings;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: `Ink compilation failed: ${message}` }, { status: 422 });
  }

  const updated = await store.approve(idParse.data, compiledJson);
  return NextResponse.json({ ok: true, session: updated, warnings });
}
