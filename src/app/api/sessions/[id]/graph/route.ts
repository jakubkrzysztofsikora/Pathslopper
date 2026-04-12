import { NextRequest, NextResponse } from "next/server";
import { SessionIdSchema } from "@/lib/schemas/session";
import { getSessionStore } from "@/lib/state/server/store-factory";
import { z } from "zod";

// PATCH /api/sessions/[id]/graph
// Accepts a partial graph diff and merges it into the stored graph server-side.
// We use z.record + z.unknown for the patch payload to avoid calling .partial()
// on a ZodEffects (superRefine makes the schema a ZodEffects, not ZodObject).

const PatchBodySchema = z.object({
  patch: z.record(z.string(), z.unknown()),
});

export async function PATCH(
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

  const bodyParse = PatchBodySchema.safeParse(body);
  if (!bodyParse.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid patch payload.", details: bodyParse.error.errors },
      { status: 400 }
    );
  }

  const store = getSessionStore();
  const session = await store.get(idParse.data);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  }

  if (session.phase !== "authoring") {
    return NextResponse.json(
      { ok: false, error: `Graph edits require 'authoring' phase; current: ${session.phase}` },
      { status: 409 }
    );
  }

  const updated = await store.updateGraph(
    idParse.data,
    bodyParse.data.patch as Parameters<typeof store.updateGraph>[1]
  );
  return NextResponse.json({ ok: true, session: updated });
}
