import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { StoryDNASchema } from "@/lib/schemas/story-dna";
import { callClaude } from "@/lib/llm/anthropic-client";
import { generateZone } from "@/lib/orchestration/generate-zone";

// TODO: LangGraph node — generateZone is the library seam. When LangGraph
// takes over, wrap it as a single node (or split Stage A/B/C into three
// nodes) and keep this route as the HTTP adapter.

// Seed strings are user-supplied and interpolated into both Stage A (Polish)
// and Stage B (English) prompts. Enforce length + reject control characters
// and backticks to block basic prompt-injection and fence-escape attempts.
const SEED_STRING = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[^\n\r\t\0`]+$/, "Seed strings cannot contain control characters or backticks.");

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
    callClaude,
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
