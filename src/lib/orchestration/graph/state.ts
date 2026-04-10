import { Annotation } from "@langchain/langgraph";
import type { PathfinderVersion } from "@/lib/schemas/version";
import type { PlayerIntent } from "@/lib/schemas/player-intent";
import type { AdjudicationResult } from "@/lib/schemas/adjudication";

/**
 * LangGraph state for the interaction resolution pipeline.
 *
 * State is intentionally small — we pass a sessionId, not the full
 * SessionState, so nodes fetch/write to the store directly. This avoids
 * serializing large objects through the graph state channels.
 */
export const InteractionState = Annotation.Root({
  // Inputs
  rawInput: Annotation<string>,
  version: Annotation<PathfinderVersion>,
  sessionId: Annotation<string | undefined>,
  overrideModifier: Annotation<number | undefined>,
  overrideDc: Annotation<number | undefined>,
  characterName: Annotation<string | undefined>,

  // Intermediate
  intent: Annotation<PlayerIntent | null>({
    reducer: (_, v) => v,
    default: () => null,
  }),
  srdContext: Annotation<string | null>({
    reducer: (_, v) => v,
    default: () => null,
  }),
  overrideConsumed: Annotation<boolean>({
    reducer: (_, v) => v,
    default: () => false,
  }),

  // Output
  result: Annotation<AdjudicationResult | null>({
    reducer: (_, v) => v,
    default: () => null,
  }),
  error: Annotation<string | null>({
    reducer: (_, v) => v,
    default: () => null,
  }),
  errorStage: Annotation<string | null>({
    reducer: (_, v) => v,
    default: () => null,
  }),
});

export type InteractionStateType = typeof InteractionState.State;
