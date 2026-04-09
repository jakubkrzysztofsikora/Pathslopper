import type { CallLLM, ChatMessage } from "@/lib/llm/client";
import type { PathfinderVersion } from "@/lib/schemas/version";
import {
  PlayerIntentSchema,
  type PlayerIntent,
} from "@/lib/schemas/player-intent";
import { buildInputOptimizerPrompt } from "@/lib/prompts/input-optimizer";
import { extractJsonBlock } from "@/lib/llm/structured-output";

/**
 * Phase 2 orchestrator. Takes raw player prose + version and returns a
 * validated PlayerIntent. The LLM response is expected to be bare JSON
 * per the optimizer system prompt; if the model wraps it in a fence we
 * still handle it via extractJsonBlock, and if it emits bare JSON we wrap
 * before extracting.
 */

export interface OptimizeInputDeps {
  callLLM: CallLLM;
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
  const { callLLM, logger } = deps;
  const { system, user } = buildInputOptimizerPrompt(rawInput, version);

  const messages: ChatMessage[] = [{ role: "user", content: user }];

  let response: string;
  try {
    response = await callLLM({ system, messages });
  } catch (err) {
    logger?.("optimize-input", err);
    return { ok: false, error: UPSTREAM_ERROR_MESSAGE };
  }

  // The optimizer is instructed to emit bare JSON. extractJsonBlock now
  // handles both fenced and bare shapes so we pass the raw response
  // through without pre-wrapping.
  const extracted = extractJsonBlock(response, PlayerIntentSchema);
  if (!extracted.ok || !extracted.data) {
    return {
      ok: false,
      error: extracted.error ?? PARSE_ERROR_MESSAGE,
      raw: extracted.raw ?? response.trim(),
    };
  }

  return { ok: true, intent: extracted.data };
}
