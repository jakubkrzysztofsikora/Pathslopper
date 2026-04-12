import type { SessionState } from "@/lib/schemas/session";
import type { SessionBrief } from "@/lib/schemas/session-brief";
import type { SessionGraph } from "@/lib/schemas/session-graph";
import { makeBrief } from "./brief-factory";
import { makeGraph } from "./graph-factory";

type Phase = SessionState["phase"];

const DEFAULT_WORLD_STATE: SessionState["worldState"] = {
  clocks: {},
  flags: [],
  vars: {},
  spotlightDebt: {},
  turnCount: 0,
  lastDirectorMove: "none",
  stallTicks: 0,
  elapsedMinutes: 0,
  ephemeralNpcs: [],
};

/**
 * Creates a valid SessionState in the requested phase.
 * Populates required sub-fields (brief, graph, inkCompiled) per phase so the
 * result passes SessionStateSchema.parse() without further adjustment.
 */
export function makeSession(
  phase: Phase = "brief",
  overrides: Partial<SessionState> = {}
): SessionState {
  const now = new Date().toISOString();
  const id = `sess-test-${Date.now()}`;

  const brief: SessionBrief = makeBrief();
  const graph: SessionGraph = makeGraph();

  const base: SessionState = {
    id,
    version: "pf2e",
    createdAt: now,
    updatedAt: now,
    phase,
    worldState: { ...DEFAULT_WORLD_STATE },
    characters: [],
  };

  // Add phase-specific fields
  if (phase !== "brief") {
    base.brief = brief;
  }
  if (phase === "authoring" || phase === "approved" || phase === "playing" || phase === "ended") {
    base.graph = graph;
  }
  if (phase === "approved" || phase === "playing" || phase === "ended") {
    base.inkCompiled = "// stub ink compiled output";
  }
  if (phase === "playing" || phase === "ended") {
    base.inkState = JSON.stringify({ currentFlow: "DEFAULT_FLOW" });
  }

  return { ...base, ...overrides };
}
