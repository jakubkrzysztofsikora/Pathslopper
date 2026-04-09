import type { CallLLM } from "@/lib/llm/client";
import type { PathfinderVersion } from "@/lib/schemas/version";
import type { AdjudicationResult } from "@/lib/schemas/adjudication";
import type { SessionState } from "@/lib/schemas/session";
import type { SessionStore } from "@/lib/state/server/session-store";
import { optimizeInput } from "./optimize-input";
import { adjudicate, type AdjudicateOptions } from "./adjudicate";

/**
 * Phase 2 + Phase 3 composition: takes raw player prose, optimizes it into
 * a PlayerIntent via the LLM, then adjudicates the intent deterministically
 * via the dice engine. When a sessionId + sessionStore are provided the
 * resolved turn is appended to the session log (Phase 4 Resolution).
 *
 * `modifier` / `dc` from the client-side Player Input Console are
 * merged onto the optimized intent AFTER optimization so the LLM cannot
 * override explicit numeric overrides from the UI.
 */

export interface ResolveInteractionInput {
  rawInput: string;
  version: PathfinderVersion;
  overrideModifier?: number;
  overrideDc?: number;
  /** Optional session ID — when present, the resolved turn is appended to the session log. */
  sessionId?: string;
}

export interface ResolveInteractionDeps {
  callLLM: CallLLM;
  adjudicateOptions?: AdjudicateOptions;
  logger?: (stage: string, err: unknown) => void;
  /** Optional server session store. Required if `sessionId` is set; otherwise ignored. */
  sessionStore?: SessionStore;
}

export type ResolveInteractionResult =
  | {
      ok: true;
      result: AdjudicationResult;
      session?: SessionState;
    }
  | {
      ok: false;
      stage: "optimize" | "session";
      error: string;
      raw?: string;
    };

export async function resolveInteraction(
  input: ResolveInteractionInput,
  deps: ResolveInteractionDeps
): Promise<ResolveInteractionResult> {
  const optimized = await optimizeInput(input.rawInput, input.version, {
    callLLM: deps.callLLM,
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

  // Phase 4 — Resolution: append to the server-owned session log.
  let session: SessionState | undefined;
  if (input.sessionId) {
    if (!deps.sessionStore) {
      return {
        ok: false,
        stage: "session",
        error: "sessionStore dependency is required when sessionId is provided.",
      };
    }
    const updated = deps.sessionStore.appendResolved(input.sessionId, {
      intent,
      result,
    });
    if (!updated) {
      return {
        ok: false,
        stage: "session",
        error: `Unknown session: ${input.sessionId}`,
      };
    }
    session = updated;
  }

  return { ok: true, result, session };
}
