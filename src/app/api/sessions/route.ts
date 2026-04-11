import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { VersionSchema } from "@/lib/schemas/version";
import { SessionBriefSchema } from "@/lib/schemas/session-brief";
import { getSessionStore } from "@/lib/state/server/store-factory";

// Create a new server-owned session. Returns the session state including
// the opaque sessionId the client keeps in sessionStorage and passes back
// on subsequent /api/interaction/* calls.
//
// If a `brief` payload is included, store.setBrief is called immediately
// after create so the client receives the fully-populated brief in the
// same response (phase remains 'brief').

const RequestSchema = z.object({
  version: VersionSchema,
  brief: SessionBriefSchema.optional(),
});

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

  const store = getSessionStore();
  let session = await store.create(parsed.data.version);

  if (parsed.data.brief) {
    const withBrief = await store.setBrief(session.id, parsed.data.brief);
    if (withBrief) session = withBrief;
  }

  return NextResponse.json({ ok: true, session });
}
