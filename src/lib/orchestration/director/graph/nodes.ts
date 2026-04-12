import type { DirectorState } from "./state";
import type { DirectorDeps, DirectorOutput } from "../director";
import type { WorldState } from "@/lib/schemas/session";
import {
  createStory,
  loadState,
  bindExternalFunction,
  continueMaximally,
  choose,
  saveState,
} from "../ink";
import { classifyMove } from "../director";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MINUTES_PER_TICK = 20;

function clampMove(
  move: ReturnType<typeof classifyMove>
): DirectorOutput["lastMove"] {
  switch (move) {
    case "hard":
      return "hard";
    case "soft":
    case "forced-soft":
      return "soft";
    case "question":
    case "spotlight-rotate":
      return "question";
    case "cutscene":
    case "introduce-npc":
    case "breather":
      return "cutscene";
  }
}

// ---------------------------------------------------------------------------
// Node 1: loadSessionNode
// Fetches the session from the store, creates an inkjs Story, loads state.
// Binds external function stubs so the story doesn't throw on external calls.
// Returns partial state with story + worldState.
// ---------------------------------------------------------------------------

export function loadSessionNode(deps: DirectorDeps) {
  return async (state: DirectorState): Promise<Partial<DirectorState>> => {
    const session = await deps.store.get(state.sessionId);
    if (!session || !session.inkCompiled) {
      throw new Error(
        `Session ${state.sessionId} has no compiled ink — call approve() first`
      );
    }

    const story = createStory(session.inkCompiled);

    if (session.inkState) {
      loadState(story, session.inkState);
    }

    // Bind external function stubs — real implementations are injected by
    // the play route; here we use no-ops so the story doesn't throw.
    for (const name of [
      "roll_skill",
      "roll_attack",
      "pick_character",
      "advance_spotlight",
    ]) {
      bindExternalFunction(story, name, (..._args: unknown[]) => 0);
    }

    return { story, worldState: session.worldState };
  };
}

// ---------------------------------------------------------------------------
// Node 2: applyInputNode
// Routes input to appropriate inkjs call.
// ---------------------------------------------------------------------------

export function applyInputNode(state: DirectorState): Partial<DirectorState> {
  const { story, input } = state;
  if (!story) return {};

  if (input.type === "choice" && input.choiceIndex !== undefined) {
    choose(story, input.choiceIndex);
  }
  // "cutscene-advance" / "start" / "continue" — ink auto-advances
  // "skip-clock-tick" — handled in tickClocksNode
  // "player-input" — handled by player-input-bridge before reaching director

  return { story };
}

// ---------------------------------------------------------------------------
// Node 3: tickClocksNode
// Checks whether any clock has been manually ticked past its segment count.
// For "skip-clock-tick" admin input, ticks the clock by 1.
// ---------------------------------------------------------------------------

export function tickClocksNode(state: DirectorState): Partial<DirectorState> {
  const { story, input, worldState } = state;
  if (!story) return {};

  const updatedWorldState: WorldState = {
    ...worldState,
    clocks: { ...worldState.clocks },
    stallTicks: worldState.stallTicks,
    elapsedMinutes: worldState.elapsedMinutes + MINUTES_PER_TICK,
  };

  if (input.type === "skip" && input.characterName) {
    // "skip" with characterName is repurposed as a clock-tick admin override
    // Character name encodes the clockId in this context
    const clockId = input.characterName;
    const current = updatedWorldState.clocks[clockId] ?? 0;
    updatedWorldState.clocks[clockId] = current + 1;
  }

  return { story, worldState: updatedWorldState };
}

// ---------------------------------------------------------------------------
// Node 4: evaluateTriggersNode
// Evaluates clock-trigger edges from the graph.
// If a clock is full (filled >= segments), diverts story to onFillNodeId.
// ---------------------------------------------------------------------------

export function evaluateTriggersNode(deps: DirectorDeps) {
  return async (state: DirectorState): Promise<Partial<DirectorState>> => {
    const { story, worldState } = state;
    if (!story) return {};

    const session = await deps.store.get(state.sessionId);
    if (!session?.graph) return {};

    const graph = session.graph;

    // Find all clock-trigger edges and check if the referenced clock is full
    const clockTriggerEdges = graph.edges.filter((e) => e.kind === "clock-trigger" && e.clockId);
    let updatedWorldState = worldState;

    for (const edge of clockTriggerEdges) {
      const clockId = edge.clockId!;
      const clock = graph.clocks.find((c) => c.id === clockId);
      if (!clock) continue;

      const filled = worldState.clocks[clockId] ?? 0;
      const isFull = filled >= clock.segments;
      if (!isFull) continue;

      // Divert the ink story to the edge's target node
      try {
        story.ChoosePathString(`knot_${edge.to}`);
      } catch {
        // If the knot doesn't exist, skip silently
        continue;
      }

      // Update cursorNodeId in worldState
      updatedWorldState = {
        ...updatedWorldState,
        cursorNodeId: edge.to,
      };

      // Only fire the first matching trigger per tick to avoid cascading
      break;
    }

    return { story, worldState: updatedWorldState };
  };
}

// ---------------------------------------------------------------------------
// Node 5: continueNode
// Runs ContinueMaximally, collects narration + choices.
// Updates stallTicks if no worldState delta occurred.
// ---------------------------------------------------------------------------

export function continueNode(state: DirectorState): Partial<DirectorState> {
  const { story, worldState } = state;
  if (!story) {
    return {
      worldState: { ...worldState, stallTicks: worldState.stallTicks + 1 },
    };
  }

  const result = continueMaximally(story);

  // Detect stall: if ink has no new narration and no choices, increment stall
  const hasProgress = result.narration.trim().length > 0 || result.ended;
  const newStallTicks = hasProgress ? 0 : worldState.stallTicks + 1;

  const updatedWorldState: WorldState = {
    ...worldState,
    stallTicks: newStallTicks,
    turnCount: worldState.turnCount + 1,
  };

  // Check if any clocks are full
  const graph = (story as unknown as { _graph?: { clocks?: Array<{ id: string; segments: number }> } })._graph;
  let anyClockFull = false;
  if (graph?.clocks) {
    for (const clock of graph.clocks) {
      const filled = updatedWorldState.clocks[clock.id] ?? 0;
      if (filled >= clock.segments) {
        anyClockFull = true;
        break;
      }
    }
  }

  // Partial output — will be enriched by pickMoveNode
  const partialOutput: DirectorOutput = {
    narration: result.narration || null,
    choices: result.choices,
    phase: result.ended
      ? "ended"
      : result.choices.length > 0
      ? "awaiting-choice"
      : "narrating",
    lastMove: worldState.lastDirectorMove,
    worldState: updatedWorldState,
    ended: result.ended,
  };

  return {
    story,
    worldState: updatedWorldState,
    output: partialOutput,
  };
}

// ---------------------------------------------------------------------------
// Node 6: pickMoveNode
// Classifies the Director's move, updates output.lastMove and worldState.
// ---------------------------------------------------------------------------

export function pickMoveNode(deps: DirectorDeps) {
  return async (state: DirectorState): Promise<Partial<DirectorState>> => {
    const { worldState, output } = state;
    if (!output) return {};

    // Load session to access graph for real signal computation
    const session = await deps.store.get(state.sessionId);
    const graph = session?.graph ?? null;

    // Compute pacing pressure
    const targetMinutes =
      (state as unknown as { _targetMinutes?: number })._targetMinutes ?? 240;
    const pacingPressure = Math.min(
      1,
      worldState.elapsedMinutes / targetMinutes
    );

    // Determine max clock urgency from actual clock fill ratios
    const maxClockUrgency = graph
      ? Math.max(
          0,
          ...graph.clocks.map((c) => {
            const filled = worldState.clocks[c.id] ?? 0;
            return c.segments > 0 ? filled / c.segments : 0;
          })
        )
      : 0;

    // Check if any clock is full
    const anyClockFull = graph
      ? graph.clocks.some((c) => {
          const filled = worldState.clocks[c.id] ?? 0;
          return filled >= c.segments;
        })
      : false;

    // Check if any portent has fired since last recorded count
    const anyPortentFired = graph
      ? graph.fronts.some((f) => {
          const fired = worldState.vars[`front_${f.id}_portents`] ?? 0;
          return typeof fired === "number" && fired > (f.firedPortents ?? 0);
        })
      : false;

    // Derive actPosition from the current cursor node's act
    const cursorNode = graph?.nodes.find(
      (n) => n.id === worldState.cursorNodeId
    );
    const actPosition: "setup" | "confrontation" | "resolution" =
      cursorNode?.act === 1
        ? "setup"
        : cursorNode?.act === 3
        ? "resolution"
        : "confrontation";

    // Find spotlight owed — character with highest debt
    const spotlightOwedTo = (() => {
      const entries = Object.entries(worldState.spotlightDebt);
      if (entries.length === 0) return null;
      const [name, debt] = entries.reduce((max, cur) =>
        cur[1] > max[1] ? cur : max
      );
      return debt >= 3 ? name : null;
    })();

    const move = classifyMove({
      worldState,
      pendingChoices: output.choices,
      narrationProduced: (output.narration?.length ?? 0) > 0,
      anyClockFull,
      anyPortentFired,
      maxClockUrgency,
      stallTicks: worldState.stallTicks,
      spotlightOwedTo,
      pacingPressure,
      actPosition,
    });

    const lastMove = clampMove(move);

    // Update spotlight debt — increment all characters, reset spotlighted one
    const updatedSpotlightDebt: Record<string, number> = {};
    for (const [name, debt] of Object.entries(worldState.spotlightDebt)) {
      updatedSpotlightDebt[name] =
        name === spotlightOwedTo ? 0 : (debt ?? 0) + 1;
    }

    const updatedWorldState: WorldState = {
      ...worldState,
      lastDirectorMove: lastMove,
      spotlightDebt: updatedSpotlightDebt,
    };

    return {
      worldState: updatedWorldState,
      output: {
        ...output,
        lastMove,
        worldState: updatedWorldState,
      },
    };
  };
}

// ---------------------------------------------------------------------------
// Node 6b: maybeGrantSecretNode
// Phase 3.5.6 — emergency secret grant on critical success.
// If the most recent adjudication was a criticalSuccess AND there are
// undiscovered secrets matching an active front, reveal one via reveal-secret.
// ---------------------------------------------------------------------------

export function maybeGrantSecretNode(deps: DirectorDeps) {
  return async (state: DirectorState): Promise<Partial<DirectorState>> => {
    const { worldState, output } = state;
    if (!output) return {};

    // Check for criticalSuccess flag in worldState vars (set by adjudicate
    // and carried through the session's worldState).
    const lastAdjudicationWasCrit =
      worldState.vars["lastAdjudicationCritSuccess"] === true;

    if (!lastAdjudicationWasCrit) return {};

    // Load session graph to check secrets and active fronts
    const session = await deps.store.get(state.sessionId);
    if (!session?.graph) return {};

    const graph = session.graph;

    // Find undiscovered secrets whose conclusionTag matches an active front id.
    // "Active" front = one that has not yet fired all its grimPortents.
    const activeFrontIds = new Set(
      graph.fronts
        .filter((f) => f.firedPortents < f.grimPortents.length)
        .map((f) => f.id)
    );

    const candidates = graph.secrets.filter(
      (s) =>
        !s.discovered &&
        activeFrontIds.has(s.conclusionTag)
    );

    if (candidates.length === 0) return {};

    // Pick the first eligible secret deterministically
    const secret = candidates[0];

    // Emit a reveal-secret effect by updating worldState vars
    const updatedVars = {
      ...worldState.vars,
      [`secret_revealed_${secret.id}`]: true,
      lastAdjudicationCritSuccess: false, // clear flag after use
    };

    const updatedWorldState = { ...worldState, vars: updatedVars };

    // Append a GM-whisper to the narration output
    const whisper = `\n\n[Szept MG — krytyczny sukces] ${secret.text}`;
    const updatedOutput = {
      ...output,
      narration: (output.narration ?? "") + whisper,
      worldState: updatedWorldState,
    };

    return { worldState: updatedWorldState, output: updatedOutput };
  };
}

// ---------------------------------------------------------------------------
// Node 7: persistNode
// Serializes ink state + worldState to the session store.
// ---------------------------------------------------------------------------

export function persistNode(deps: DirectorDeps) {
  return async (state: DirectorState): Promise<Partial<DirectorState>> => {
    const { story, worldState, output } = state;
    if (!story || !output) return {};

    const inkState = saveState(story);
    await deps.store.tick(state.sessionId, inkState, worldState);

    return { output };
  };
}
