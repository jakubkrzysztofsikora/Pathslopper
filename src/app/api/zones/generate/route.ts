import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { StoryDNASchema } from "@/lib/schemas/story-dna";
import { buildZonePromptChain } from "@/lib/prompts/zone-generator";
import { callClaude } from "@/lib/llm/anthropic-client";
import type Anthropic from "@anthropic-ai/sdk";

// TODO: LangGraph node — this route can become a node in a zone-generation subgraph.
// Stage A and B can be parallel branches; Stage C is the verification join node.

const RequestSchema = z.object({
  dna: StoryDNASchema,
  seed: z.object({
    biome: z.string().min(1),
    encounterIntent: z.string().min(1),
  }),
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
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Stage A failed.",
      },
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
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Stage B failed.",
      },
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

    // Re-prompt Stage B once with explicit phrase prohibition
    const forbiddenList = verifyResult.bannedHits
      .map((p) => `"${p}"`)
      .join(", ");

    const retrySystem =
      stageBPrompts.system +
      `\n\nCRITICAL: The following phrases are EXPLICITLY FORBIDDEN and must not appear anywhere in your response: ${forbiddenList}.`;

    const retryMessages: Anthropic.MessageParam[] = [
      { role: "user", content: stageBPrompts.user },
    ];

    try {
      markdown = await callClaude({
        system: retrySystem,
        messages: retryMessages,
      });
      verifyResult = chain.stageC(markdown, dna);
      if (verifyResult.bannedHits.length > 0) {
        warnings.push(
          `Banned phrases persisted after retry: ${verifyResult.bannedHits.join(", ")}.`
        );
      }
    } catch (err) {
      warnings.push(
        `Stage B retry failed: ${err instanceof Error ? err.message : "Unknown error."}`
      );
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
