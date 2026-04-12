import { describe, it, expect } from "vitest";
import { selectEnding, shouldEndSession, evaluatePredicate } from "@/lib/orchestration/director/endings";
import type { Ending } from "@/lib/schemas/session-graph";
import type { WorldState } from "@/lib/schemas/session";

const BASE_WORLD: WorldState = {
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

const VICTORY_ENDING: Ending = {
  id: "end-v",
  nodeId: "node-v",
  condition: { op: "flag-set", flag: "tyrant-defeated" },
  title: "Zwycięstwo",
  summary: "Dobro zwyciężyło.",
  category: "victory",
  frontOutcomes: {},
};

const DEFEAT_ENDING: Ending = {
  id: "end-d",
  nodeId: "node-d",
  condition: { op: "clock-gte", clockId: "clock-doom", value: 4 },
  title: "Klęska",
  summary: "Drużyna pokonana.",
  category: "defeat",
  frontOutcomes: {},
};

const TPK_ENDING: Ending = {
  id: "end-tpk",
  nodeId: "node-tpk",
  condition: { op: "flag-set", flag: "tpk" },
  title: "TPK",
  summary: "Wszyscy polegli.",
  category: "tpk",
  frontOutcomes: {},
};

describe("evaluatePredicate", () => {
  it("flag-set returns true when flag present", () => {
    const world = { ...BASE_WORLD, flags: ["tyrant-defeated"] };
    expect(evaluatePredicate({ op: "flag-set", flag: "tyrant-defeated" }, world)).toBe(true);
  });

  it("flag-set returns false when flag absent", () => {
    expect(evaluatePredicate({ op: "flag-set", flag: "tyrant-defeated" }, BASE_WORLD)).toBe(false);
  });

  it("flag-unset returns true when flag absent", () => {
    expect(evaluatePredicate({ op: "flag-unset", flag: "missing" }, BASE_WORLD)).toBe(true);
  });

  it("clock-gte returns true when clock meets threshold", () => {
    const world = { ...BASE_WORLD, clocks: { "clock-doom": 5 } };
    expect(evaluatePredicate({ op: "clock-gte", clockId: "clock-doom", value: 4 }, world)).toBe(true);
  });

  it("clock-gte returns false when clock below threshold", () => {
    const world = { ...BASE_WORLD, clocks: { "clock-doom": 2 } };
    expect(evaluatePredicate({ op: "clock-gte", clockId: "clock-doom", value: 4 }, world)).toBe(false);
  });

  it("and returns true only when all children true", () => {
    const world = { ...BASE_WORLD, flags: ["a", "b"] };
    expect(evaluatePredicate({
      op: "and",
      children: [
        { op: "flag-set", flag: "a" },
        { op: "flag-set", flag: "b" },
      ],
    }, world)).toBe(true);
    expect(evaluatePredicate({
      op: "and",
      children: [
        { op: "flag-set", flag: "a" },
        { op: "flag-set", flag: "c" },
      ],
    }, world)).toBe(false);
  });

  it("or returns true when at least one child true", () => {
    const world = { ...BASE_WORLD, flags: ["a"] };
    expect(evaluatePredicate({
      op: "or",
      children: [
        { op: "flag-set", flag: "a" },
        { op: "flag-set", flag: "z" },
      ],
    }, world)).toBe(true);
  });

  it("not inverts the child", () => {
    expect(evaluatePredicate({ op: "not", child: { op: "flag-set", flag: "x" } }, BASE_WORLD)).toBe(true);
    const world = { ...BASE_WORLD, flags: ["x"] };
    expect(evaluatePredicate({ op: "not", child: { op: "flag-set", flag: "x" } }, world)).toBe(false);
  });
});

describe("selectEnding", () => {
  it("returns null when no condition met", () => {
    expect(selectEnding([VICTORY_ENDING, DEFEAT_ENDING], BASE_WORLD)).toBeNull();
  });

  it("returns matching ending when flag set", () => {
    const world = { ...BASE_WORLD, flags: ["tyrant-defeated"] };
    expect(selectEnding([VICTORY_ENDING, DEFEAT_ENDING], world)).toEqual(VICTORY_ENDING);
  });

  it("returns first match in order", () => {
    const world = { ...BASE_WORLD, flags: ["tyrant-defeated"], clocks: { "clock-doom": 4 } };
    expect(selectEnding([VICTORY_ENDING, DEFEAT_ENDING], world)).toEqual(VICTORY_ENDING);
  });
});

describe("shouldEndSession", () => {
  it("returns shouldEnd=false when no condition met and low turn count", () => {
    const result = shouldEndSession([VICTORY_ENDING, DEFEAT_ENDING], BASE_WORLD, "scene");
    expect(result.shouldEnd).toBe(false);
    expect(result.reason).toBeNull();
  });

  it("returns shouldEnd=true when ending predicate satisfied", () => {
    const world = { ...BASE_WORLD, flags: ["tyrant-defeated"] };
    const result = shouldEndSession([VICTORY_ENDING, DEFEAT_ENDING], world, "scene");
    expect(result.shouldEnd).toBe(true);
    expect(result.reason).toBe("ending-condition-met");
    expect(result.ending).toEqual(VICTORY_ENDING);
  });

  it("detects TPK via tpk flag via predicate match when ending has matching condition", () => {
    const world = { ...BASE_WORLD, flags: ["tpk"] };
    // TPK_ENDING has condition flag-set "tpk" → selectEnding fires first (reason=ending-condition-met)
    const result = shouldEndSession([VICTORY_ENDING, DEFEAT_ENDING, TPK_ENDING], world, "scene");
    expect(result.shouldEnd).toBe(true);
    expect(result.ending).toEqual(TPK_ENDING);
  });

  it("detects TPK via tpk flag when no explicit tpk ending has condition", () => {
    // Use a world with tpk flag and NO ending that matches it by predicate
    const world = { ...BASE_WORLD, flags: ["tpk"] };
    const result = shouldEndSession([VICTORY_ENDING, DEFEAT_ENDING], world, "scene");
    // No predicate matches → falls through to tpk flag check
    expect(result.shouldEnd).toBe(true);
    expect(result.reason).toBe("tpk");
    expect(result.ending).toBeNull();
  });

  it("detects cursor at ending node", () => {
    const result = shouldEndSession([VICTORY_ENDING], BASE_WORLD, "ending");
    expect(result.shouldEnd).toBe(true);
    expect(result.reason).toBe("cursor-at-ending-node");
  });

  it("triggers max-turns-reached safety valve", () => {
    const world = { ...BASE_WORLD, turnCount: 200 };
    const result = shouldEndSession([VICTORY_ENDING, DEFEAT_ENDING], world, "scene", 200);
    expect(result.shouldEnd).toBe(true);
    expect(result.reason).toBe("max-turns-reached");
  });
});
