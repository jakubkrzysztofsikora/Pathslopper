import { NextRequest, NextResponse } from "next/server";
import { getSessionStore } from "@/lib/state/server/store-factory";
import { SessionIdSchema } from "@/lib/schemas/session";
import { CharacterSheetParsedSchema } from "@/lib/schemas/character-sheet";

// Thin HTTP adapter: add a parsed character sheet to a session's roster.
// POST /api/sessions/[id]/characters

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const idParse = SessionIdSchema.safeParse(params.id);
  if (!idParse.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid session ID." },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const characterParse = CharacterSheetParsedSchema.safeParse(body);
  if (!characterParse.success) {
    return NextResponse.json(
      { ok: false, error: characterParse.error.flatten() },
      { status: 400 }
    );
  }

  const store = getSessionStore();

  // Verify session exists before attempting to add.
  const existing = await store.get(idParse.data);
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: "Session not found." },
      { status: 404 }
    );
  }

  let session;
  try {
    session = await store.addCharacter(idParse.data, characterParse.data);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Could not add character." },
      { status: 409 }
    );
  }

  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Session not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, session });
}
