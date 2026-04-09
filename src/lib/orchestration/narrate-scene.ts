import type { CallLLM, ChatMessage } from "@/lib/llm/client";
import type { SessionState } from "@/lib/schemas/session";
import { buildNarratorPrompt } from "@/lib/prompts/narrator";
import { scanBannedPhrases } from "@/lib/prompts/banned-phrases";

/**
 * Phase 1 orchestrator: narrate the current scene based on a session's
 * append-only turn log. Pure in the sense that it does not mutate the
 * store — the caller (route handler) decides whether to persist the
 * narration as a new turn, so tests can exercise the narrator in
 * isolation.
 *
 * Runs the same banned-phrase slop scan as the zone generator's Stage C
 * and surfaces hits as warnings (we don't auto-retry narration yet —
 * narration is cheap to regenerate on demand from the UI).
 */

export interface NarrateSceneInput {
  session: SessionState;
  worldStateHash: string;
  sceneSeed?: string;
}

export interface NarrateSceneDeps {
  callLLM: CallLLM;
  logger?: (stage: string, err: unknown) => void;
}

export type NarrateSceneResult =
  | {
      ok: true;
      markdown: string;
      warnings: string[];
      worldStateHash: string;
    }
  | { ok: false; error: string };

const UPSTREAM_ERROR_MESSAGE = "Upstream model call failed.";

export async function narrateScene(
  input: NarrateSceneInput,
  deps: NarrateSceneDeps
): Promise<NarrateSceneResult> {
  const { session, worldStateHash, sceneSeed } = input;
  const { callLLM, logger } = deps;

  const { system, user } = buildNarratorPrompt({
    session,
    version: session.version,
    sceneSeed,
    worldStateHash,
  });

  const messages: ChatMessage[] = [{ role: "user", content: user }];

  let markdown: string;
  try {
    markdown = await callLLM({ system, messages });
  } catch (err) {
    logger?.("narrate-scene", err);
    return { ok: false, error: UPSTREAM_ERROR_MESSAGE };
  }

  const bannedHits = scanBannedPhrases(markdown);
  const warnings: string[] =
    bannedHits.length > 0
      ? [`Banned phrases detected in narration: ${bannedHits.join(", ")}.`]
      : [];

  return {
    ok: true,
    markdown: markdown.trim(),
    warnings,
    worldStateHash,
  };
}
