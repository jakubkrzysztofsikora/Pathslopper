import { optimizeInput } from "../optimize-input";
import { adjudicate, type AdjudicateOptions } from "../adjudicate";
import type { CallLLM } from "@/lib/llm/client";
import type { SessionStore } from "@/lib/state/server/session-store";
import type { VectorStore } from "@/lib/rag/vector-store";
import type { InteractionStateType } from "./state";

/**
 * External dependencies injected into each graph node.
 *
 * This mirrors ResolveInteractionDeps but is graph-specific to keep the
 * dependency injection explicit and the graph module self-contained.
 */
export interface GraphDeps {
  callLLM: CallLLM;
  sessionStore?: SessionStore;
  srdIndex?: VectorStore;
  embedTexts?: (texts: string[]) => Promise<number[][]>;
  adjudicateOptions?: AdjudicateOptions;
  logger?: (stage: string, err: unknown) => void;
}

/**
 * Node: optimize
 *
 * Runs the Phase 2 input optimizer. Applies any UI modifier/DC overrides
 * on top of the LLM-inferred intent so the player can pin numeric values.
 */
export function createOptimizeNode(deps: GraphDeps) {
  return async (state: InteractionStateType): Promise<Partial<InteractionStateType>> => {
    const result = await optimizeInput(state.rawInput, state.version, {
      callLLM: deps.callLLM,
      logger: deps.logger,
    });

    if (!result.ok) {
      return { error: result.error, errorStage: "optimize" };
    }

    // Apply explicit UI overrides so the player can pin modifier/DC
    // regardless of what the LLM inferred.
    const intent = {
      ...result.intent,
      modifier:
        state.overrideModifier !== undefined
          ? state.overrideModifier
          : result.intent.modifier,
      dc:
        state.overrideDc !== undefined ? state.overrideDc : result.intent.dc,
    };

    return { intent };
  };
}

/**
 * Node: overrideCheck
 *
 * Looks up the active manager override in the session store. Sets
 * overrideConsumed=true when one is found so the adjudicate node can
 * produce a synthetic result without rolling dice.
 */
export function createOverrideCheckNode(deps: GraphDeps) {
  return async (
    state: InteractionStateType
  ): Promise<Partial<InteractionStateType>> => {
    if (!state.sessionId || !deps.sessionStore) {
      return { overrideConsumed: false };
    }
    const session = await deps.sessionStore.get(state.sessionId);
    if (!session?.activeOverride) {
      return { overrideConsumed: false };
    }
    return { overrideConsumed: true };
  };
}

/**
 * Node: srdRetrieval
 *
 * Retrieves relevant SRD rules context via vector similarity search.
 * Non-fatal: any error is logged and the pipeline continues without context.
 */
export function createSrdRetrievalNode(deps: GraphDeps) {
  return async (
    state: InteractionStateType
  ): Promise<Partial<InteractionStateType>> => {
    if (!deps.srdIndex || !deps.embedTexts || !state.intent) {
      return { srdContext: null };
    }
    try {
      const queryText = `${state.intent.action} ${state.intent.skillOrAttack ?? ""} ${state.intent.description}`;
      const [queryEmbedding] = await deps.embedTexts([queryText]);
      const chunks = deps.srdIndex.search(queryEmbedding, 3);
      if (chunks.length > 0) {
        return {
          srdContext: chunks.map((c) => `[${c.metadata.name}] ${c.text}`).join("\n"),
        };
      }
    } catch (err) {
      deps.logger?.("srd-retrieval", err);
    }
    return { srdContext: null };
  };
}

/**
 * Node: adjudicate
 *
 * Deterministically adjudicates the optimized intent. Short-circuits on
 * prior error. Handles the manager override path (synthetic result, no dice).
 */
export function createAdjudicateNode(deps: GraphDeps) {
  return async (
    state: InteractionStateType
  ): Promise<Partial<InteractionStateType>> => {
    // Short-circuit if a prior node errored.
    if (state.error) return {};

    if (!state.intent) {
      return { error: "No intent", errorStage: "adjudicate" };
    }

    // Manager override path: produce a synthetic result without rolling dice.
    if (state.overrideConsumed && state.sessionId && deps.sessionStore) {
      const session = await deps.sessionStore.get(state.sessionId);
      if (session?.activeOverride) {
        const syntheticResult = {
          intent: state.intent,
          roll: {
            formula: "",
            rolls: [],
            modifiers: [],
            total: 0,
            breakdown: "(manager override — no dice rolled)",
          },
          outcome: "resolved" as const,
          summary: session.activeOverride.forcedOutcome,
        };
        await deps.sessionStore.clearActiveOverride(state.sessionId);
        return { result: syntheticResult };
      }
    }

    const result = adjudicate(state.intent, {
      ...deps.adjudicateOptions,
      srdContext: state.srdContext ?? undefined,
    });
    return { result };
  };
}

/**
 * Node: persist
 *
 * Appends the resolved turn to the server-owned session log.
 * No-ops when sessionId or sessionStore are absent.
 */
export function createPersistNode(deps: GraphDeps) {
  return async (
    state: InteractionStateType
  ): Promise<Partial<InteractionStateType>> => {
    if (state.error || !state.result || !state.sessionId || !deps.sessionStore) {
      return {};
    }
    await deps.sessionStore.appendResolved(state.sessionId, {
      intent: state.result.intent,
      result: state.result,
    });
    return {};
  };
}
