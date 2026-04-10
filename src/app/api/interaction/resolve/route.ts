import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { VersionSchema } from "@/lib/schemas/version";
import { SessionIdSchema } from "@/lib/schemas/session";
import { callLLM } from "@/lib/llm/client";
import { resolveInteraction } from "@/lib/orchestration/resolve-interaction";
import { getSessionStore } from "@/lib/state/server/store-factory";

// Thin HTTP adapter for the Phase 2 + Phase 3 + Phase 4 slice of the
// Stateful Interaction Loop. All orchestration lives in
// src/lib/orchestration/resolve-interaction.ts per the CLAUDE.md rule.

// Reject all C0 control characters (0x00-0x1F) and backticks. This blocks
// the simplest prompt-injection vector (newline + "SYSTEM:" forgery) and
// fence-escape attempts while still allowing normal action prose.
const INPUT_STRING = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  // eslint-disable-next-line no-control-regex
  .regex(/^[^\x00-\x1f`]+$/, "Input contains control characters or backticks.");

const RequestSchema = z.object({
  rawInput: INPUT_STRING,
  version: VersionSchema,
  overrideModifier: z.number().int().finite().min(-20).max(40).optional(),
  overrideDc: z.number().int().finite().min(1).max(60).optional(),
  sessionId: SessionIdSchema.optional(),
  characterName: z.string().trim().min(1).max(200).optional(),
});

function logServerError(stage: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[interaction/resolve] ${stage} failed: ${message}`);
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

  const result = await resolveInteraction(parsed.data, {
    callLLM,
    logger: logServerError,
    sessionStore: parsed.data.sessionId ? getSessionStore() : undefined,
  });

  if (!result.ok) {
    const status = result.stage === "session" ? 404 : 502;
    return NextResponse.json(
      { ok: false, error: result.error, raw: result.raw },
      { status }
    );
  }

  return NextResponse.json({
    ok: true,
    result: result.result,
    session: result.session,
  });
}
