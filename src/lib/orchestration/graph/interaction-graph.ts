import { StateGraph, END, START } from "@langchain/langgraph";
import { InteractionState } from "./state";
import {
  createOptimizeNode,
  createOverrideCheckNode,
  createSrdRetrievalNode,
  createAdjudicateNode,
  createPersistNode,
  type GraphDeps,
} from "./nodes";

/**
 * Builds and compiles the LangGraph interaction resolution graph.
 *
 * Pipeline:
 *   overrideCheck → optimize → srdRetrieval → adjudicate → persist → END
 *
 * `overrideCheck` runs FIRST. When a manager override is active it
 * populates state.intent with a stub and sets overrideConsumed=true,
 * causing the downstream `optimize` node to short-circuit (no LLM call).
 * This mirrors the imperative `resolveInteraction` contract: the
 * override path is strictly LLM-independent.
 *
 * `srdRetrieval` still runs on the override path but with the stub
 * intent; it's non-fatal and only informational, so the extra vector
 * query is acceptable. Adjudicate produces a synthetic result when
 * overrideConsumed is true, and persist uses SessionStore.consumeOverride
 * to clear the override flag and append the resolved turn atomically.
 *
 * @see GraphDeps for injected dependencies
 */
export function buildInteractionGraph(deps: GraphDeps) {
  const graph = new StateGraph(InteractionState)
    .addNode("overrideCheck", createOverrideCheckNode(deps))
    .addNode("optimize", createOptimizeNode(deps))
    .addNode("srdRetrieval", createSrdRetrievalNode(deps))
    .addNode("adjudicate", createAdjudicateNode(deps))
    .addNode("persist", createPersistNode(deps))
    .addEdge(START, "overrideCheck")
    .addEdge("overrideCheck", "optimize")
    .addEdge("optimize", "srdRetrieval")
    .addEdge("srdRetrieval", "adjudicate")
    .addEdge("adjudicate", "persist")
    .addEdge("persist", END);

  return graph.compile();
}
