import { describe, it, expect } from "vitest";
import { classifyMove } from "@/lib/orchestration/director/director";
import type { ClassifyInput } from "@/lib/orchestration/director/director";
import type { WorldState } from "@/lib/schemas/session";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeWorldState(overrides: Partial<WorldState> = {}): WorldState {
  return {
    clocks: {},
    flags: [],
    vars: {},
    spotlightDebt: {},
    turnCount: 0,
    lastDirectorMove: "none",
    stallTicks: 0,
    elapsedMinutes: 0,
    ephemeralNpcs: [],
    ...overrides,
  };
}

function makeInput(overrides: Partial<ClassifyInput> = {}): ClassifyInput {
  return {
    worldState: makeWorldState(),
    pendingChoices: [],
    narrationProduced: true,
    anyClockFull: false,
    anyPortentFired: false,
    maxClockUrgency: 0,
    stallTicks: 0,
    spotlightOwedTo: null,
    pacingPressure: 0.5,
    actPosition: "confrontation",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// classifyMove matrix
// ---------------------------------------------------------------------------

describe("classifyMove — deadlock recovery", () => {
  it("returns forced-soft when stallTicks >= 3", () => {
    const result = classifyMove(makeInput({ stallTicks: 3 }));
    expect(result).toBe("forced-soft");
  });

  it("returns forced-soft for stallTicks > 3 too", () => {
    const result = classifyMove(makeInput({ stallTicks: 10 }));
    expect(result).toBe("forced-soft");
  });

  it("does NOT return forced-soft when stallTicks < 3", () => {
    const result = classifyMove(makeInput({ stallTicks: 2 }));
    expect(result).not.toBe("forced-soft");
  });
});

describe("classifyMove — hard move", () => {
  it("returns hard when anyClockFull is true", () => {
    const result = classifyMove(makeInput({ anyClockFull: true }));
    expect(result).toBe("hard");
  });

  it("returns hard when anyPortentFired is true", () => {
    const result = classifyMove(makeInput({ anyPortentFired: true }));
    expect(result).toBe("hard");
  });
});

describe("classifyMove — spotlight rotation", () => {
  it("returns spotlight-rotate when spotlight debt >= 3 and no choices", () => {
    const result = classifyMove(
      makeInput({
        spotlightOwedTo: "Alice",
        pendingChoices: [],
        worldState: makeWorldState({ spotlightDebt: { Alice: 5 } }),
      })
    );
    expect(result).toBe("spotlight-rotate");
  });

  it("does NOT rotate when choices are pending (question wins)", () => {
    const result = classifyMove(
      makeInput({
        spotlightOwedTo: "Alice",
        pendingChoices: [{ index: 0, label: "Fight" }],
      })
    );
    // question has higher score than spotlight-rotate when choices exist
    expect(result).toBe("question");
  });
});

describe("classifyMove — question", () => {
  it("returns question when choices are pending", () => {
    const result = classifyMove(
      makeInput({
        pendingChoices: [{ index: 0, label: "Attack" }],
      })
    );
    expect(result).toBe("question");
  });
});

describe("classifyMove — soft move (pacing pressure)", () => {
  it("returns soft when pacingPressure >= 0.7 and not in resolution", () => {
    const result = classifyMove(
      makeInput({
        pacingPressure: 0.75,
        actPosition: "confrontation",
        pendingChoices: [],
      })
    );
    expect(result).toBe("soft");
  });

  it("does NOT return soft from pacing when in resolution act", () => {
    const result = classifyMove(
      makeInput({
        pacingPressure: 0.9,
        actPosition: "resolution",
        pendingChoices: [],
      })
    );
    expect(result).not.toBe("soft");
  });
});

describe("classifyMove — soft move (clock urgency)", () => {
  it("returns soft when maxClockUrgency >= 0.75", () => {
    const result = classifyMove(
      makeInput({
        maxClockUrgency: 0.8,
        pendingChoices: [],
      })
    );
    expect(result).toBe("soft");
  });
});

describe("classifyMove — breather", () => {
  it("returns breather after two hard moves (lastDirectorMove=hard, turnCount>0)", () => {
    const result = classifyMove(
      makeInput({
        worldState: makeWorldState({
          lastDirectorMove: "hard",
          turnCount: 3,
        }),
        pendingChoices: [],
        anyClockFull: false,
        anyPortentFired: false,
        maxClockUrgency: 0,
        pacingPressure: 0,
      })
    );
    expect(result).toBe("breather");
  });
});

describe("classifyMove — cutscene default", () => {
  it("returns cutscene as default when no signals fire", () => {
    const result = classifyMove(makeInput());
    expect(result).toBe("cutscene");
  });
});

describe("classifyMove — cooldown penalty", () => {
  it("does not repeat same move twice if an alternative scores higher", () => {
    // Last move was 'question', choices are pending → question gets -2 cooldown
    // With pendingChoices, question score = 6 + (-2) = 4
    // cutscene score = 1 + 0 = 1
    // But 4 > 1, so question still wins — test that cooldown doesn't cause wrong choice
    const result = classifyMove(
      makeInput({
        worldState: makeWorldState({ lastDirectorMove: "question" }),
        pendingChoices: [{ index: 0, label: "Fight" }],
        maxClockUrgency: 0,
        pacingPressure: 0.5,
      })
    );
    // question (6-2=4) vs cutscene (1-0=1) — question still wins
    expect(result).toBe("question");
  });

  it("switches from cutscene to soft when clock urgency fires and cutscene is on cooldown", () => {
    const result = classifyMove(
      makeInput({
        worldState: makeWorldState({ lastDirectorMove: "cutscene" }),
        pendingChoices: [],
        maxClockUrgency: 0.8, // soft score = 5 + 0 = 5
        pacingPressure: 0.5,
        // cutscene score = 1 + (-2) = -1
      })
    );
    expect(result).toBe("soft");
  });
});

describe("classifyMove — stall triggers forced-soft", () => {
  it("forced-soft for stall >= 3 even with choices pending", () => {
    const result = classifyMove(
      makeInput({
        stallTicks: 5,
        pendingChoices: [{ index: 0, label: "Run" }],
        anyClockFull: true,
      })
    );
    expect(result).toBe("forced-soft");
  });
});
