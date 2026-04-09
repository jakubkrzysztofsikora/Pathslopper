import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { StoryDNASchema } from "@/lib/schemas/story-dna";
import { callLLM } from "@/lib/llm/client";
import { generateZone } from "@/lib/orchestration/generate-zone";

// TODO: LangGraph node — generateZone is the library seam. When LangGraph
// takes over, wrap it as a single node (or split Stage A/B/C into three
// nodes) and keep this route as the HTTP adapter.

// Seed strings are user-supplied and interpolated into both Stage A (Polish)
// and Stage B (English) prompts. Reject all C0 control characters
// (0x00-0x1F) and backticks — same pattern as /api/interaction/resolve —
// to block newline-based "SYSTEM:" forgery and fence-escape attempts.
// NOTE: this is a first-line guard only. Plain-text injection like
// "Ignore prior instructions" still needs the output-side banned-phrase
// scan + the anti-sycophancy clause in the GM system prompt.
const SEED_STRING = z
  .string()
  .trim()
  .min(1)
  .max(200)
  // eslint-disable-next-line no-control-regex
  .regex(/^[^\x00-\x1f`]+$/, "Seed strings cannot contain control characters or backticks.");

const RequestSchema = z.object({
  dna: StoryDNASchema,
  seed: z.object({
    biome: SEED_STRING,
    encounterIntent: SEED_STRING,
  }),
});

function logServerError(stage: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[zones/generate] ${stage} failed: ${message}`);
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

  const { dna, seed } = parsed.data;

  const result = await generateZone(dna, seed, {
    callLLM,
    logger: logServerError,
  });

  if (!result.ok) {
    const status = result.stage === "verify" ? 422 : 502;
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        warnings: result.warnings,
        markdown: result.markdown,
      },
      { status }
    );
  }

  return NextResponse.json({
    ok: true,
    markdown: result.markdown,
    zone: result.zone,
    warnings: result.warnings,
  });
}
