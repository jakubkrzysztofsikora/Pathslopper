import { NextRequest, NextResponse } from "next/server";
import { getSessionStore } from "@/lib/state/server/store-factory";
import { SessionIdSchema } from "@/lib/schemas/session";

// Fetch a session state by ID. The Player Input Console uses this to
// refresh its turn log after a resolve or a narrate.

export async function GET(
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

  const session = await getSessionStore().get(idParse.data);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Session not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, session });
}
