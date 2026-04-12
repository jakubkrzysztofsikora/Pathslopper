import type { CallLLM } from "@/lib/llm/client";
import type { SessionStore, } from "@/lib/state/server/session-store";
import type { WorldState } from "@/lib/schemas/session";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DirectorInput {
  type: "start" | "continue" | "choice" | "player-input" | "skip";
  choiceIndex?: number;
  /** Free-text player action — only when type === "player-input" */
  playerInput?: string;
  /** Which PC is acting */
  characterName?: string;
}

export interface DirectorOutput {
  narration: string | null;
  choices: { index: number; label: string }[];
  phase: "narrating" | "awaiting-choice" | "awaiting-roll" | "ended";
  pendingRoll?: { skillOrAttack: string; dc: number; characterName: string };
  lastMove: "hard" | "soft" | "question" | "cutscene" | "none";
  worldState: WorldState;
  ended: boolean;
}

// ---------------------------------------------------------------------------
// Move classifier types (Amendment O — scored decision function)
// ---------------------------------------------------------------------------

export type Move =
  | "cutscene"
  | "soft"
  | "hard"
  | "question"
  | "spotlight-rotate"
  | "introduce-npc"
  | "breather"
  | "forced-soft";

export interface ClassifyInput {
  worldState: WorldState;
  pendingChoices: { index: number; label: string }[];
  narrationProduced: boolean;
  anyClockFull: boolean;
  anyPortentFired: boolean;
  maxClockUrgency: number; // 0..1
  stallTicks: number;
  spotlightOwedTo: string | null;
  pacingPressure: number; // 0..1
  actPosition: "setup" | "confrontation" | "resolution";
}

// ---------------------------------------------------------------------------
// classifyMove — pure scored decision function (Amendment D + O)
// Inlined here per Amendment D (no separate file).
// ---------------------------------------------------------------------------

export function classifyMove(input: ClassifyInput): Move {
  const last = input.worldState.lastDirectorMove;

  function cooldown(m: Move): number {
    const moveMatchesLast =
      (m === "hard" && last === "hard") ||
      (m === "soft" && last === "soft") ||
      (m === "question" && last === "question") ||
      (m === "spotlight-rotate" && last === "spotlight-rotate" as string) ||
      (m === "introduce-npc" && last === "introduce-npc" as string) ||
      (m === "breather" && last === "breather" as string) ||
      (m === "cutscene" && last === "cutscene");
    return moveMatchesLast ? -2 : 0;
  }

  // Deadlock recovery — no cooldown, always wins
  if (input.stallTicks >= 3) {
    return "forced-soft";
  }

  const scores: Array<[Move, number]> = [];

  // Clock-fills / fired portents → hard consequence
  if (input.anyClockFull || input.anyPortentFired) {
    scores.push(["hard", 10 + cooldown("hard")]);
  }

  // Spotlight debt with no pending choices → rotate focus
  if (input.spotlightOwedTo && input.pendingChoices.length === 0) {
    scores.push(["spotlight-rotate", 7 + cooldown("spotlight-rotate")]);
  }

  // Pending choices → ask a targeted question
  if (input.pendingChoices.length > 0) {
    scores.push(["question", 6 + cooldown("question")]);
  }

  // High clock urgency → soft telegraph
  if (input.maxClockUrgency >= 0.75) {
    scores.push(["soft", 5 + cooldown("soft")]);
  }

  // Pacing pressure — past 70% wall-clock, not in final act
  if (input.pacingPressure >= 0.7 && input.actPosition !== "resolution") {
    scores.push(["soft", 4 + cooldown("soft")]);
  }

  // Two hard moves in a row → breather
  if (last === "hard" && input.worldState.turnCount > 0) {
    scores.push(["breather", 3]);
  }

  // Safe default — advance narration
  scores.push(["cutscene", 1 + cooldown("cutscene")]);

  scores.sort((a, b) => b[1] - a[1]);
  return scores[0][0];
}

// ---------------------------------------------------------------------------
// Director deps
// ---------------------------------------------------------------------------

export interface DirectorDeps {
  callLLM: CallLLM;
  store: SessionStore;
  sessionId: string;
}

// ---------------------------------------------------------------------------
// director — public entry point
// Builds the LangGraph and invokes it for one tick.
// ---------------------------------------------------------------------------

export async function director(
  input: DirectorInput,
  deps: DirectorDeps
): Promise<DirectorOutput> {
  // Lazy-import LangGraph to avoid ESM issues in test environments
  const { StateGraph, START, END } = await import("@langchain/langgraph");
  const {
    loadSessionNode,
    applyInputNode,
    tickClocksNode,
    evaluateTriggersNode,
    continueNode,
    pickMoveNode,
    persistNode,
  } = await import("./graph/nodes");

  const { DirectorStateAnnotation } = await import("./graph/state");

  const graph = new StateGraph(DirectorStateAnnotation)
    .addNode("load", loadSessionNode(deps))
    .addNode("applyInput", applyInputNode)
    .addNode("tickClocks", tickClocksNode)
    .addNode("evaluateTriggers", evaluateTriggersNode)
    .addNode("continue", continueNode)
    .addNode("pickMove", pickMoveNode)
    .addNode("persist", persistNode(deps))
    .addEdge(START, "load")
    .addEdge("load", "applyInput")
    .addEdge("applyInput", "tickClocks")
    .addEdge("tickClocks", "evaluateTriggers")
    .addEdge("evaluateTriggers", "continue")
    .addEdge("continue", "pickMove")
    .addEdge("pickMove", "persist")
    .addEdge("persist", END);

  const compiled = graph.compile();

  const session = await deps.store.get(deps.sessionId);
  if (!session) {
    throw new Error(`Session ${deps.sessionId} not found`);
  }

  const initialState = {
    sessionId: deps.sessionId,
    input,
    story: null,
    worldState: session.worldState,
    output: null,
  };

  const result = await compiled.invoke(initialState);

  if (!result.output) {
    throw new Error("Director graph produced no output");
  }

  return result.output;
}
