import type { CallClaudeOptions } from "@/lib/llm/anthropic-client";
import type { PathfinderVersion } from "@/lib/schemas/version";
import type { AdjudicationResult } from "@/lib/schemas/adjudication";
import { optimizeInput } from "./optimize-input";
import { adjudicate, type AdjudicateOptions } from "./adjudicate";

/**
 * Phase 2 + Phase 3 composition: takes raw player prose, optimizes it into
 * a PlayerIntent via Claude, then adjudicates the intent deterministically
 * via the dice engine. Returns a tagged result so the HTTP adapter can map
 * failure modes to the right status code.
 *
 * `modifier` / `dc` from the client-side Player Input Console are
 * merged onto the optimized intent AFTER optimization so the LLM cannot
 * override explicit numeric overrides from the UI.
 */

type CallClaude = (opts: CallClaudeOptions) => Promise<string>;

export interface ResolveInteractionInput {
  rawInput: string;
  version: PathfinderVersion;
  overrideModifier?: number;
  overrideDc?: number;
}

export interface ResolveInteractionDeps {
  callClaude: CallClaude;
  adjudicateOptions?: AdjudicateOptions;
  logger?: (stage: string, err: unknown) => void;
}

export type ResolveInteractionResult =
  | { ok: true; result: AdjudicationResult }
  | { ok: false; stage: "optimize"; error: string; raw?: string };

export async function resolveInteraction(
  input: ResolveInteractionInput,
  deps: ResolveInteractionDeps
): Promise<ResolveInteractionResult> {
  const optimized = await optimizeInput(input.rawInput, input.version, {
    callClaude: deps.callClaude,
    logger: deps.logger,
  });

  if (!optimized.ok) {
    return {
      ok: false,
      stage: "optimize",
      error: optimized.error,
      raw: optimized.raw,
    };
  }

  // Apply explicit UI overrides on top of the optimized intent so the
  // player can pin a modifier / DC regardless of what the LLM inferred.
  const intent = {
    ...optimized.intent,
    modifier:
      input.overrideModifier !== undefined
        ? input.overrideModifier
        : optimized.intent.modifier,
    dc: input.overrideDc !== undefined ? input.overrideDc : optimized.intent.dc,
  };

  const result = adjudicate(intent, deps.adjudicateOptions);
  return { ok: true, result };
}
