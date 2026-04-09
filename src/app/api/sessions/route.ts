import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { VersionSchema } from "@/lib/schemas/version";
import { getSessionStore } from "@/lib/state/server/session-store";

// Create a new server-owned session. Returns the session state including
// the opaque sessionId the client keeps in sessionStorage and passes back
// on subsequent /api/interaction/* calls.

const RequestSchema = z.object({
  version: VersionSchema,
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

  const session = getSessionStore().create(parsed.data.version);
  return NextResponse.json({ ok: true, session });
}
