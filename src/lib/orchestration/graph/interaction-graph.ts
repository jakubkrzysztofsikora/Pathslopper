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
 *   optimize → overrideCheck ─┐
 *          └→ srdRetrieval   ─┴→ adjudicate → persist → END
 *
 * The fan-out from "optimize" to both "overrideCheck" and "srdRetrieval"
 * runs them sequentially. The fan-in barrier on "adjudicate" ensures both
 * upstream nodes have completed before adjudication runs.
 *
 * @see GraphDeps for injected dependencies
 */
export function buildInteractionGraph(deps: GraphDeps) {
  const graph = new StateGraph(InteractionState)
    .addNode("optimize", createOptimizeNode(deps))
    .addNode("overrideCheck", createOverrideCheckNode(deps))
    .addNode("srdRetrieval", createSrdRetrievalNode(deps))
    .addNode("adjudicate", createAdjudicateNode(deps))
    .addNode("persist", createPersistNode(deps))
    // Entry point
    .addEdge(START, "optimize")
    // Fan-out from optimize to both parallel checks
    .addEdge("optimize", "overrideCheck")
    .addEdge("optimize", "srdRetrieval")
    // Fan-in: wait for both overrideCheck and srdRetrieval before adjudicate
    .addEdge(["overrideCheck", "srdRetrieval"], "adjudicate")
    .addEdge("adjudicate", "persist")
    .addEdge("persist", END);

  return graph.compile();
}
