import type Anthropic from "@anthropic-ai/sdk";
import type { StoryDNA } from "@/lib/schemas/story-dna";
import type { TacticalZone } from "@/lib/schemas/zone";
import {
  buildZonePromptChain,
  type ZoneSeed,
} from "@/lib/prompts/zone-generator";
import type { CallClaudeOptions } from "@/lib/llm/anthropic-client";

/**
 * Pure orchestrator for the Tactical Environment Protocol zone generation
 * pipeline. Sequences Stage A (Polish mechanical skeleton) → Stage B
 * (English narration + JSON) → Stage C (verify + slop scan), retries
 * Stage B once with a real corrective conversation turn on banned-phrase
 * hits, and surfaces a typed result rather than an HTTP response.
 *
 * Dependencies are injected so tests can exercise the orchestrator
 * directly without mocking the Anthropic client module. The route handler
 * in src/app/api/zones/generate/route.ts is a thin HTTP adapter that
 * wires the real callClaude into this function — see the orchestration
 * location rule in CLAUDE.md.
 */

type CallClaude = (opts: CallClaudeOptions) => Promise<string>;

export interface GenerateZoneDeps {
  callClaude: CallClaude;
  logger?: (stage: string, err: unknown) => void;
}

export type GenerateZoneFailureStage = "stageA" | "stageB" | "verify";

export type GenerateZoneResult =
  | {
      ok: true;
      markdown: string;
      zone: TacticalZone;
      warnings: string[];
    }
  | {
      ok: false;
      stage: GenerateZoneFailureStage;
      error: string;
      warnings: string[];
      markdown?: string;
    };

const UPSTREAM_ERROR_MESSAGE = "Upstream model call failed.";
const VERIFY_ERROR_MESSAGE = "Zone JSON could not be extracted or validated.";

export async function generateZone(
  dna: StoryDNA,
  seed: ZoneSeed,
  deps: GenerateZoneDeps
): Promise<GenerateZoneResult> {
  const { callClaude, logger } = deps;
  const chain = buildZonePromptChain(dna, seed);
  const warnings: string[] = [];

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
    logger?.("stageA", err);
    return {
      ok: false,
      stage: "stageA",
      error: UPSTREAM_ERROR_MESSAGE,
      warnings,
    };
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
    logger?.("stageB", err);
    return {
      ok: false,
      stage: "stageB",
      error: UPSTREAM_ERROR_MESSAGE,
      warnings,
    };
  }

  // Stage C — verify + slop scan (pure, no upstream call)
  let verifyResult = chain.stageC(markdown, dna);

  if (verifyResult.bannedHits.length > 0) {
    warnings.push(
      `Banned phrases detected: ${verifyResult.bannedHits.join(", ")}. Re-prompting Stage B.`
    );

    // Real corrective retry: feed the bad output back as an assistant turn
    // and issue a targeted rewrite instruction. This gives the model a
    // concrete signal about what tripped the filter.
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
      logger?.("stageB-retry", err);
      warnings.push("Stage B retry failed upstream; returning best-effort.");
    }
  }

  if (!verifyResult.zone) {
    return {
      ok: false,
      stage: "verify",
      error: VERIFY_ERROR_MESSAGE,
      warnings,
      markdown,
    };
  }

  return {
    ok: true,
    markdown,
    zone: verifyResult.zone,
    warnings,
  };
}
