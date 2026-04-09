import type Anthropic from "@anthropic-ai/sdk";
import type { CallClaudeOptions } from "@/lib/llm/anthropic-client";
import type { PathfinderVersion } from "@/lib/schemas/version";
import {
  PlayerIntentSchema,
  type PlayerIntent,
} from "@/lib/schemas/player-intent";
import { buildInputOptimizerPrompt } from "@/lib/prompts/input-optimizer";
import { extractJsonBlock } from "@/lib/llm/structured-output";

/**
 * Phase 2 orchestrator. Takes raw player prose + version and returns a
 * validated PlayerIntent. The Claude response is expected to be bare JSON
 * per the optimizer system prompt; if the model wraps it in a fence we
 * still handle it via extractJsonBlock, and if it emits bare JSON we wrap
 * before extracting.
 */

type CallClaude = (opts: CallClaudeOptions) => Promise<string>;

export interface OptimizeInputDeps {
  callClaude: CallClaude;
  logger?: (stage: string, err: unknown) => void;
}

export type OptimizeInputResult =
  | { ok: true; intent: PlayerIntent }
  | {
      ok: false;
      error: string;
      raw?: string;
    };

const UPSTREAM_ERROR_MESSAGE = "Upstream model call failed.";
const PARSE_ERROR_MESSAGE =
  "Could not parse PlayerIntent from optimizer response.";

export async function optimizeInput(
  rawInput: string,
  version: PathfinderVersion,
  deps: OptimizeInputDeps
): Promise<OptimizeInputResult> {
  const { callClaude, logger } = deps;
  const { system, user } = buildInputOptimizerPrompt(rawInput, version);

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];

  let response: string;
  try {
    response = await callClaude({ system, messages });
  } catch (err) {
    logger?.("optimize-input", err);
    return { ok: false, error: UPSTREAM_ERROR_MESSAGE };
  }

  // The optimizer is instructed to emit bare JSON. Wrap in a fence if
  // missing so extractJsonBlock can parse it with the same pipeline as
  // the character-sheet route.
  const trimmed = response.trim();
  const fenced = trimmed.startsWith("```")
    ? trimmed
    : "```json\n" + trimmed + "\n```";

  const extracted = extractJsonBlock(fenced, PlayerIntentSchema);
  if (!extracted.ok || !extracted.data) {
    return {
      ok: false,
      error: extracted.error ?? PARSE_ERROR_MESSAGE,
      raw: extracted.raw ?? trimmed,
    };
  }

  return { ok: true, intent: extracted.data };
}
