import type { CallLLM } from "@/lib/llm/client";
import type { PathfinderVersion } from "@/lib/schemas/version";
import type { AdjudicationResult } from "@/lib/schemas/adjudication";
import type { SessionState } from "@/lib/schemas/session";
import type { PlayerIntent } from "@/lib/schemas/player-intent";
import type { SessionStore } from "@/lib/state/server/session-store";
import type { VectorStore } from "@/lib/rag/vector-store";
import type { embedTexts as EmbedTextsFn } from "@/lib/rag/embed";
import { optimizeInput } from "./optimize-input";
import { adjudicate, type AdjudicateOptions } from "./adjudicate";
// Graph import is lazy (dynamic import inside resolveViaGraph) to avoid
// loading @langchain/langgraph when USE_LANGGRAPH=false (the default).

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

/**
 * Build a minimal PlayerIntent from the raw input without calling the LLM.
 * Used on the manager-override bypass path, where the optimized intent is
 * never consulted by the dice engine (the forced outcome comes straight
 * from the session's activeOverride). Avoiding optimizeInput on this path
 * keeps the override path deterministic — real LLMs are occasionally
 * flaky at temperature 0.7 and a bad JSON parse on an ignored field must
 * not fail a request the GM has already decided.
 */
function buildOverrideStubIntent(
  input: ResolveInteractionInput
): PlayerIntent {
  const trimmed = input.rawInput.trim();
  const description = trimmed.length > 0 ? trimmed.slice(0, 300) : "Player action";
  return {
    version: input.version,
    rawInput: description,
    action: "narrative",
    description,
    ...(input.overrideModifier !== undefined && {
      modifier: input.overrideModifier,
    }),
    ...(input.overrideDc !== undefined && { dc: input.overrideDc }),
  };
}

export async function resolveInteraction(
  input: ResolveInteractionInput,
  deps: ResolveInteractionDeps
): Promise<ResolveInteractionResult> {
  if (process.env.USE_LANGGRAPH === "true") {
    return resolveViaGraph(input, deps);
  }

  // Phase 0 — Early session load + override bypass.
  //
  // When the session has an activeOverride the GM has already decided the
  // outcome and the optimized intent would be discarded anyway. Calling
  // the LLM here is both wasteful and a source of flakiness: if the model
  // returns invalid JSON or a schema-invalid intent, the whole request
  // fails even though the LLM's answer was never going to be used. Do
  // the override check BEFORE optimize so the bypass path is
  // LLM-independent.
  let currentSession: SessionState | undefined;
  if (input.sessionId) {
    if (!deps.sessionStore) {
      return {
        ok: false,
        stage: "session",
        error: "sessionStore dependency is required when sessionId is provided.",
      };
    }
    currentSession = await deps.sessionStore.get(input.sessionId);
    if (!currentSession) {
      return {
        ok: false,
        stage: "session",
        error: `Unknown session: ${input.sessionId}`,
      };
    }

    if (currentSession.activeOverride) {
      const stubIntent = buildOverrideStubIntent(input);
      const syntheticResult: AdjudicationResult = {
        intent: stubIntent,
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
      await deps.sessionStore.clearActiveOverride(input.sessionId);
      const updated = await deps.sessionStore.appendResolved(input.sessionId, {
        intent: stubIntent,
        result: syntheticResult,
      });
      return {
        ok: true,
        result: syntheticResult,
        session: updated ?? undefined,
      };
    }
  }

  // Phase 2 — Input optimization via LLM.
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

  // Phase 3/4 — Adjudication + persistence.
  let session: SessionState | undefined;
  let adjudicateOptions = deps.adjudicateOptions ?? {};

  // Character lookup uses the session we already loaded during Phase 0.
  if (currentSession && input.characterName) {
    const character = currentSession.characters.find(
      (c) => c.name === input.characterName
    );
    if (character) {
      adjudicateOptions = { ...adjudicateOptions, character };
    }
  }

  const result = adjudicate(intent, { ...adjudicateOptions, srdContext });

  if (input.sessionId) {
    // sessionStore already verified in Phase 0.
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

/**
 * LangGraph execution path. Activated only when USE_LANGGRAPH=true.
 *
 * The graph module is lazily imported so that the @langchain/langgraph
 * package is never loaded in the default (flag-off) code path.
 */
async function resolveViaGraph(
  input: ResolveInteractionInput,
  deps: ResolveInteractionDeps
): Promise<ResolveInteractionResult> {
  const { buildInteractionGraph } = await import("./graph/interaction-graph");

  const graph = buildInteractionGraph({
    callLLM: deps.callLLM,
    sessionStore: deps.sessionStore,
    srdIndex: deps.srdIndex,
    embedTexts: deps.embedTexts,
    adjudicateOptions: deps.adjudicateOptions,
    logger: deps.logger,
  });

  const graphResult = await graph.invoke({
    rawInput: input.rawInput,
    version: input.version,
    sessionId: input.sessionId,
    overrideModifier: input.overrideModifier,
    overrideDc: input.overrideDc,
    characterName: input.characterName,
  });

  if (graphResult.error) {
    return {
      ok: false,
      stage: (graphResult.errorStage as "optimize" | "session") ?? "optimize",
      error: graphResult.error,
    };
  }

  if (!graphResult.result) {
    return { ok: false, stage: "optimize", error: "No result produced by graph" };
  }

  let session: SessionState | undefined;
  if (input.sessionId && deps.sessionStore) {
    session = (await deps.sessionStore.get(input.sessionId)) ?? undefined;
  }

  return { ok: true, result: graphResult.result, session };
}
