/**
 * endings.ts — Pure functions for Phase 6 ending selection (Amendment M).
 *
 * selectEnding: given a WorldState and Ending[], pick the first matching ending.
 * shouldEndSession: determine if the session has hit a terminal condition.
 */

import type { Ending } from "@/lib/schemas/session-graph";
import type { WorldState } from "@/lib/schemas/session";
import type { Predicate } from "@/lib/schemas/session-graph";

// ---------------------------------------------------------------------------
// Predicate evaluation
// ---------------------------------------------------------------------------

export function evaluatePredicate(pred: Predicate, world: WorldState): boolean {
  switch (pred.op) {
    case "flag-set":
      return world.flags.includes(pred.flag);

    case "flag-unset":
      return !world.flags.includes(pred.flag);

    case "clock-filled": {
      const filled = world.clocks[pred.clockId] ?? 0;
      // We need the total segments — not available in WorldState alone.
      // Convention: "clock-filled" is satisfied when clock value >= its segment count.
      // Since we only store filled count, treat value >= 4 (minimum segments) as filled.
      // In practice the Director sets flags when clocks fill, so flag-set is preferred.
      // This provides a best-effort fallback.
      return filled >= 4;
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
      return pred.children.every((c) => evaluatePredicate(c, world));

    case "or":
      return pred.children.some((c) => evaluatePredicate(c, world));

    case "not":
      return !evaluatePredicate(pred.child, world);

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
  world: WorldState
): Ending | null {
  for (const ending of endings) {
    if (evaluatePredicate(ending.condition, world)) {
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
  maxTurns: number = 200
): EndSessionCheck {
  // 1. Predicate-based ending
  const matchedEnding = selectEnding(endings, world);
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
