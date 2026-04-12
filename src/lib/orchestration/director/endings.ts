/**
 * endings.ts — Pure functions for Phase 6 ending selection (Amendment M).
 *
 * selectEnding: given a WorldState and Ending[], pick the first matching ending.
 * shouldEndSession: determine if the session has hit a terminal condition.
 */

import type { Ending, SessionGraph } from "@/lib/schemas/session-graph";
import type { WorldState } from "@/lib/schemas/session";
import type { Predicate } from "@/lib/schemas/session-graph";

// ---------------------------------------------------------------------------
// Predicate evaluation
// ---------------------------------------------------------------------------

export function evaluatePredicate(
  pred: Predicate,
  world: WorldState,
  graph?: SessionGraph | null
): boolean {
  switch (pred.op) {
    case "flag-set":
      return world.flags.includes(pred.flag);

    case "flag-unset":
      return !world.flags.includes(pred.flag);

    case "clock-filled": {
      const filled = world.clocks[pred.clockId] ?? 0;
      // Look up the clock's actual segment count from the graph when available.
      // Fall back to 4 (minimum clock size) when graph is not provided.
      const clock = graph?.clocks.find((c) => c.id === pred.clockId);
      const segments = clock?.segments ?? 4;
      return filled >= segments;
    }

    case "clock-gte": {
      const val = world.clocks[pred.clockId] ?? 0;
      return val >= pred.value;
    }

    case "var-gte": {
      const val = getNestedVar(world.vars, pred.path);
      return typeof val === "number" && val >= pred.value;
    }

    case "and":
      return pred.children.every((c) => evaluatePredicate(c, world, graph));

    case "or":
      return pred.children.some((c) => evaluatePredicate(c, world, graph));

    case "not":
      return !evaluatePredicate(pred.child, world, graph);

    default:
      return false;
  }
}

function getNestedVar(vars: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let node: unknown = vars;
  for (const p of parts) {
    if (node && typeof node === "object" && p in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return node;
}

// ---------------------------------------------------------------------------
// selectEnding
// ---------------------------------------------------------------------------

/**
 * Return the first Ending whose predicate is satisfied by the current WorldState.
 * Returns null if no ending condition is met yet.
 */
export function selectEnding(
  endings: Ending[],
  world: WorldState,
  graph?: SessionGraph | null
): Ending | null {
  for (const ending of endings) {
    if (evaluatePredicate(ending.condition, world, graph)) {
      return ending;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// shouldEndSession
// ---------------------------------------------------------------------------

export interface EndSessionCheck {
  shouldEnd: boolean;
  ending: Ending | null;
  /** Reason key for logging / UI */
  reason:
    | "ending-condition-met"
    | "tpk"
    | "cursor-at-ending-node"
    | "max-turns-reached"
    | null;
}

/**
 * Determines whether the session should end.
 *
 * Checks (in priority order):
 * 1. Any Ending predicate satisfied.
 * 2. TPK flag set in world.flags.
 * 3. Cursor is sitting on a node whose kind === "ending".
 * 4. Turn count exceeded max (safety valve).
 */
export function shouldEndSession(
  endings: Ending[],
  world: WorldState,
  cursorNodeKind: string | undefined,
  maxTurns: number = 200,
  graph?: SessionGraph | null
): EndSessionCheck {
  // 1. Predicate-based ending
  const matchedEnding = selectEnding(endings, world, graph);
  if (matchedEnding) {
    return { shouldEnd: true, ending: matchedEnding, reason: "ending-condition-met" };
  }

  // 2. TPK
  if (world.flags.includes("tpk")) {
    const tpkEnding = endings.find((e) => e.category === "tpk") ?? null;
    return { shouldEnd: true, ending: tpkEnding, reason: "tpk" };
  }

  // 3. Cursor at ending node
  if (cursorNodeKind === "ending") {
    return { shouldEnd: true, ending: null, reason: "cursor-at-ending-node" };
  }

  // 4. Safety valve
  if (world.turnCount >= maxTurns) {
    const fallback = endings.find((e) => e.category === "mixed") ??
      endings.find((e) => e.category === "victory") ??
      null;
    return { shouldEnd: true, ending: fallback, reason: "max-turns-reached" };
  }

  return { shouldEnd: false, ending: null, reason: null };
}
