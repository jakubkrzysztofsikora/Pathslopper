import { z } from "zod";
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

/**
 * Normalize an LLM-emitted PlayerIntent blob BEFORE schema validation.
 *
 * LLMs (especially llama-family models at temperature > 0) routinely emit
 * `null` or `""` for optional fields even when the prompt explicitly says
 * "omit if not applicable". Example observed from Scaleway
 * `llama-3.1-70b-instruct` on the input "I search for traps":
 *
 *   {
 *     "version": "pf2e",
 *     "action": "skill-check",
 *     "skillOrAttack": "Perception",
 *     "target": "",          // <- empty string, breaks min(1)
 *     "modifier": null,      // <- null, breaks number().optional()
 *     "dc": null,            // <- same
 *     "actionCost": 1
 *   }
 *
 * PlayerIntentSchema rejects `null` for `.optional()` numbers and rejects
 * empty strings for `.min(1)` strings, so the whole request fails with a
 * schema validation error even though the intent is structurally fine.
 *
 * We strip these pseudo-nulls out of the payload so Zod treats them as
 * "missing" and the optional branches kick in. The original schema is left
 * strict for every other caller (session log, API route body) — this
 * preprocessor only runs on the LLM boundary.
 */
export function normalizeLlmIntent(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return raw;
  }
  const obj: Record<string, unknown> = { ...(raw as Record<string, unknown>) };

  // Optional fields (both numeric and short-string): drop any of
  //   - null
  //   - undefined
  //   - an empty-or-whitespace string
  // so Zod's `.optional()` branches take over. Unified across numeric
  // and string optionals because LLMs don't respect the type distinction
  // and frequently emit `""` for uncertain numbers and `null` for
  // uncertain strings — we need to tolerate both shapes on both keys.
  // Required fields (rawInput, description) are not in this list, so
  // they stay strict and schema validation catches genuinely malformed
  // intents.
  const optionalKeys = [
    "modifier",
    "dc",
    "actionCost",
    "target",
    "skillOrAttack",
  ];
  for (const key of optionalKeys) {
    const v = obj[key];
    if (v == null) {
      delete obj[key];
    } else if (typeof v === "string" && v.trim() === "") {
      delete obj[key];
    }
  }

  return obj;
}

// Schema wrapper used only for the LLM-optimize boundary. Preprocesses
// raw parsed JSON through `normalizeLlmIntent` before delegating to
// `PlayerIntentSchema`.
const LlmPlayerIntentSchema = z.preprocess(normalizeLlmIntent, PlayerIntentSchema);

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
  // through without pre-wrapping. The schema is wrapped in a preprocess
  // step that normalizes null / empty-string values the LLM emits for
  // optional fields — see normalizeLlmIntent for the rationale.
  const extracted = extractJsonBlock(response, LlmPlayerIntentSchema);
  if (!extracted.ok || !extracted.data) {
    return {
      ok: false,
      error: extracted.error ?? PARSE_ERROR_MESSAGE,
      raw: extracted.raw ?? response.trim(),
    };
  }

  return { ok: true, intent: extracted.data };
}
