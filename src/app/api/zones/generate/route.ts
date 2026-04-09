import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { StoryDNASchema } from "@/lib/schemas/story-dna";
import { buildZonePromptChain } from "@/lib/prompts/zone-generator";
import { callClaude } from "@/lib/llm/anthropic-client";
import type Anthropic from "@anthropic-ai/sdk";

// TODO: LangGraph node — this route can become a node in a zone-generation subgraph.
// Stage A and B can be parallel branches; Stage C is the verification join node.
// The retry-once-on-banned-phrase policy should move to src/lib/orchestration/generateZone.ts
// before a second stateful endpoint lands, per architect-reviewer guidance.

// Seed strings are user-supplied and interpolated into both Stage A (Polish) and
// Stage B (English) prompts. Enforce length + reject control characters and
// backticks to block basic prompt-injection and fence-escape attempts.
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

// Generic client-facing error messages. Full details are logged server-side
// via console.error but never returned to the client to avoid leaking
// request IDs, model names, or rate-limit headers from the Anthropic SDK.
const UPSTREAM_ERROR_MESSAGE = "Upstream model call failed.";

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
  const chain = buildZonePromptChain(dna, seed);

  // Stage A — Polish mechanical skeleton
  const stageAPrompts = chain.stageA(dna.version);
  const stageAMessages: Anthropic.MessageParam[] = [
    { role: "user", content: stageAPrompts.user },
  ];

  let polishSkeleton: string;
  try {
    polishSkeleton = await callClaude({
      system: stageAPrompts.system,
      messages: stageAMessages,
    });
  } catch (err) {
    logServerError("stageA", err);
    return NextResponse.json(
      { ok: false, error: UPSTREAM_ERROR_MESSAGE },
      { status: 502 }
    );
  }

  // Stage B — English narration + JSON zone
  const stageBPrompts = chain.stageB(polishSkeleton, dna);
  const stageBMessages: Anthropic.MessageParam[] = [
    { role: "user", content: stageBPrompts.user },
  ];

  let markdown: string;
  try {
    markdown = await callClaude({
      system: stageBPrompts.system,
      messages: stageBMessages,
    });
  } catch (err) {
    logServerError("stageB", err);
    return NextResponse.json(
      { ok: false, error: UPSTREAM_ERROR_MESSAGE },
      { status: 502 }
    );
  }

  // Stage C — verify + slop scan
  let verifyResult = chain.stageC(markdown, dna);
  const warnings: string[] = [];

  if (verifyResult.bannedHits.length > 0) {
    warnings.push(
      `Banned phrases detected: ${verifyResult.bannedHits.join(", ")}. Re-prompting Stage B.`
    );

    // Real corrective retry: feed the bad output back as an assistant turn
    // and issue a targeted rewrite instruction as the next user turn. This
    // gives the model a concrete signal about what tripped the filter.
    const forbiddenList = verifyResult.bannedHits
      .map((p) => `"${p}"`)
      .join(", ");

    const retryMessages: Anthropic.MessageParam[] = [
      { role: "user", content: stageBPrompts.user },
      { role: "assistant", content: markdown },
      {
        role: "user",
        content: `Your previous response contained these forbidden phrases: ${forbiddenList}. Rewrite it end-to-end, preserving the TacticalZone schema JSON block at the end and all mechanical details, but replace every flagged phrase with concrete sensory language. Do not emit any of the flagged phrases verbatim.`,
      },
    ];

    try {
      markdown = await callClaude({
        system: stageBPrompts.system,
        messages: retryMessages,
      });
      verifyResult = chain.stageC(markdown, dna);
      if (verifyResult.bannedHits.length > 0) {
        warnings.push(
          `Banned phrases persisted after retry: ${verifyResult.bannedHits.join(", ")}.`
        );
      }
    } catch (err) {
      logServerError("stageB-retry", err);
      warnings.push("Stage B retry failed upstream; returning best-effort.");
    }
  }

  if (!verifyResult.zone) {
    return NextResponse.json(
      {
        ok: false,
        error: "Zone JSON could not be extracted or validated.",
        warnings,
        markdown,
      },
      { status: 422 }
    );
  }

  return NextResponse.json({
    ok: true,
    markdown,
    zone: verifyResult.zone,
    warnings,
  });
}
