import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SessionIdSchema } from "@/lib/schemas/session";
import { callLLM } from "@/lib/llm/client";
import { summarizeDeadlock } from "@/lib/orchestration/summarize-deadlock";
import { getSessionStore } from "@/lib/state/server/store-factory";

// Thin HTTP adapter for HITL Manager Mode (Break the Fourth Wall).
// POST /api/sessions/[id]/override
//
// Discriminated union body:
//   { action: "summarize", lastN?: number }
//   { action: "force", forcedOutcome: string, summary: string, turnsConsidered: number }
//
// "summarize" generates an LLM summary of recent turns so the GM can
// understand the current deadlock pattern before forcing an outcome.
//
// "force" sets an active override on the session. The next resolve call
// will consume it, producing a synthetic result using the forcedOutcome
// text instead of rolling dice.

const FORCED_OUTCOME = z.string().trim().min(1).max(2000);
const SUMMARY = z.string().trim().min(1).max(2000);

const RequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("summarize"),
    lastN: z.number().int().min(1).max(50).optional(),
  }),
  z.object({
    action: z.literal("force"),
    forcedOutcome: FORCED_OUTCOME,
    summary: SUMMARY,
    turnsConsidered: z.number().int().min(1).max(50),
  }),
]);

function logServerError(stage: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[sessions/override] ${stage} failed: ${message}`);
}

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

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten() },
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

  if (parsed.data.action === "summarize") {
    const lastN = parsed.data.lastN ?? 10;
    const result = await summarizeDeadlock(session, lastN, {
      callLLM,
      logger: logServerError,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.error === "No turns to summarize." ? 422 : 502 }
      );
    }
    return NextResponse.json({
      ok: true,
      summary: result.summary,
      warnings: result.warnings,
    });
  }

  // action === "force"
  const { forcedOutcome, summary, turnsConsidered } = parsed.data;
  const updated = await store.setActiveOverride(
    idParse.data,
    forcedOutcome,
    summary,
    turnsConsidered
  );
  if (!updated) {
    return NextResponse.json(
      { ok: false, error: "Session not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, session: updated });
}
