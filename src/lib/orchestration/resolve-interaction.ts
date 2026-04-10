import type { CallLLM } from "@/lib/llm/client";
import type { PathfinderVersion } from "@/lib/schemas/version";
import type { AdjudicationResult } from "@/lib/schemas/adjudication";
import type { SessionState } from "@/lib/schemas/session";
import type { SessionStore } from "@/lib/state/server/session-store";
import type { VectorStore } from "@/lib/rag/vector-store";
import type { embedTexts as EmbedTextsFn } from "@/lib/rag/embed";
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
  /** Optional character name — when present and session exists, auto-derives modifier from the character sheet. */
  characterName?: string;
}

export interface ResolveInteractionDeps {
  callLLM: CallLLM;
  adjudicateOptions?: AdjudicateOptions;
  logger?: (stage: string, err: unknown) => void;
  /** Optional server session store. Required if `sessionId` is set; otherwise ignored. */
  sessionStore?: SessionStore;
  /** Optional SRD vector index. When provided alongside `embedTexts`, retrieves rules context. */
  srdIndex?: VectorStore;
  /** Optional embedding function. Must be provided together with `srdIndex`. */
  embedTexts?: typeof EmbedTextsFn;
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

  // SRD RAG retrieval — informational only, never used to derive modifiers/DCs.
  // Non-fatal: any error is logged and the request continues without SRD context.
  let srdContext: string | undefined;
  if (deps.srdIndex && deps.embedTexts) {
    try {
      const queryText = `${intent.action} ${intent.skillOrAttack ?? ""} ${intent.description}`;
      const [queryEmbedding] = await deps.embedTexts([queryText]);
      const chunks = deps.srdIndex.search(queryEmbedding, 3);
      if (chunks.length > 0) {
        srdContext = chunks.map((c) => `[${c.metadata.name}] ${c.text}`).join("\n");
      }
    } catch (err) {
      deps.logger?.("srd-retrieval", err);
      // Non-fatal: proceed without SRD context.
    }
  }

  // Phase 4 — Resolution: append to the server-owned session log.
  // If characterName is provided, load the session first to find the character
  // and use it to auto-derive the modifier.
  let session: SessionState | undefined;
  let adjudicateOptions = deps.adjudicateOptions ?? {};

  if (input.sessionId) {
    if (!deps.sessionStore) {
      return {
        ok: false,
        stage: "session",
        error: "sessionStore dependency is required when sessionId is provided.",
      };
    }

    // Load the session to check for an active override and optionally derive
    // modifier from the character sheet.
    const currentSession = await deps.sessionStore.get(input.sessionId);
    if (!currentSession) {
      return {
        ok: false,
        stage: "session",
        error: `Unknown session: ${input.sessionId}`,
      };
    }

    // Check for active override — produce a synthetic result without rolling dice.
    if (currentSession.activeOverride) {
      const syntheticResult: AdjudicationResult = {
        intent,
        roll: {
          formula: "",
          rolls: [],
          modifiers: [],
          total: 0,
          breakdown: "(manager override — no dice rolled)",
        },
        outcome: "resolved",
        summary: currentSession.activeOverride.forcedOutcome,
      };
      // Clear the override and append a resolved turn.
      await deps.sessionStore.clearActiveOverride(input.sessionId);
      const updated = await deps.sessionStore.appendResolved(input.sessionId, {
        intent,
        result: syntheticResult,
      });
      return { ok: true, result: syntheticResult, session: updated ?? undefined };
    }

    // Find the character if characterName is provided.
    if (input.characterName) {
      const character = currentSession.characters.find(
        (c) => c.name === input.characterName
      );
      if (character) {
        adjudicateOptions = { ...adjudicateOptions, character };
      }
    }
  }

  const result = adjudicate(intent, { ...adjudicateOptions, srdContext });

  if (input.sessionId) {
    // sessionStore already verified above.
    const updated = await deps.sessionStore!.appendResolved(input.sessionId, {
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
