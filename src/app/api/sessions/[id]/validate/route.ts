import { NextRequest, NextResponse } from "next/server";
import { SessionIdSchema } from "@/lib/schemas/session";
import { SessionGraphSchema } from "@/lib/schemas/session-graph";
import { getSessionStore } from "@/lib/state/server/store-factory";

// POST /api/sessions/[id]/validate
// Runs the Zod schema validator on the stored graph and returns issues.

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const idParse = SessionIdSchema.safeParse(params.id);
  if (!idParse.success) {
    return NextResponse.json({ ok: false, error: "Invalid session ID." }, { status: 400 });
  }

  const session = await getSessionStore().get(idParse.data);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  }

  if (!session.graph) {
    return NextResponse.json(
      { ok: false, error: "Session has no graph to validate." },
      { status: 400 }
    );
  }

  const result = SessionGraphSchema.safeParse(session.graph);
  if (result.success) {
    return NextResponse.json({ ok: true, issues: [] });
  }

  const issues = result.error.errors.map((e) => ({
    path: e.path.join("."),
    message: e.message,
  }));

  return NextResponse.json({ ok: true, issues });
}
