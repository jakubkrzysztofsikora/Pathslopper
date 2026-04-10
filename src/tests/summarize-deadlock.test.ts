import { describe, it, expect, vi } from "vitest";
import { summarizeDeadlock } from "@/lib/orchestration/summarize-deadlock";
import type { SessionState } from "@/lib/schemas/session";

function makeSession(turns: SessionState["turns"] = []): SessionState {
  return {
    id: "abcdefghijk12345",
    version: "pf2e",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    turns,
    characters: [],
    activeOverride: null as null,
  };
}

const resolvedTurn = {
  kind: "resolved" as const,
  at: new Date().toISOString(),
  intent: {
    version: "pf2e" as const,
    rawInput: "I swing at the goblin",
    action: "strike" as const,
    description: "Strike the goblin.",
    modifier: 5,
    dc: 15,
  },
  result: {
    intent: {
      version: "pf2e" as const,
      rawInput: "I swing at the goblin",
      action: "strike" as const,
      description: "Strike the goblin.",
      modifier: 5,
      dc: 15,
    },
    roll: {
      formula: "1d20+5",
      rolls: [10],
      modifiers: [{ label: "STR", value: 5 }],
      total: 15,
      breakdown: "1d20(10) + 5 = 15 vs DC 15 — SUCCESS",
      dc: 15,
      degreeOfSuccess: "success" as const,
    },
    outcome: "resolved" as const,
    summary: "Hit the goblin successfully.",
  },
};

const narrationTurn = {
  kind: "narration" as const,
  at: new Date().toISOString(),
  markdown: "The goblin growls and readies itself.",
  worldStateHash: "abc12345",
};

describe("summarizeDeadlock", () => {
  it("returns summary from mock LLM", async () => {
    const callLLM = vi
      .fn()
      .mockResolvedValueOnce("The party has attempted to strike the goblin twice without success.");

    const session = makeSession([resolvedTurn, resolvedTurn]);
    const result = await summarizeDeadlock(session, 5, { callLLM });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toContain("goblin");
      expect(Array.isArray(result.warnings)).toBe(true);
    }
    expect(callLLM).toHaveBeenCalledOnce();
  });

  it("only considers last N turns when N < total turns", async () => {
    const callLLM = vi
      .fn()
      .mockResolvedValueOnce("Two recent turns summarized.");

    const session = makeSession([resolvedTurn, narrationTurn, resolvedTurn, resolvedTurn, resolvedTurn]);
    const result = await summarizeDeadlock(session, 2, { callLLM });
    expect(result.ok).toBe(true);
    // Verify LLM was called with only 2 turns referenced
    const callArgs = callLLM.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain("2 recent");
  });

  it("returns error on LLM failure", async () => {
    const callLLM = vi.fn().mockRejectedValueOnce(new Error("LLM is down"));
    const logger = vi.fn();

    const session = makeSession([resolvedTurn]);
    const result = await summarizeDeadlock(session, 5, { callLLM, logger });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("LLM is down");
    }
    expect(logger).toHaveBeenCalledWith("summarize-deadlock", expect.any(Error));
  });

  it("returns error on empty turns", async () => {
    const callLLM = vi.fn();
    const session = makeSession([]);
    const result = await summarizeDeadlock(session, 5, { callLLM });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("No turns to summarize.");
    }
    expect(callLLM).not.toHaveBeenCalled();
  });

  it("banned-phrase scan runs on LLM output and reports warnings", async () => {
    const callLLM = vi
      .fn()
      .mockResolvedValueOnce(
        "The party failed to delve into the dungeon. Moreover, they were stuck."
      );

    const session = makeSession([resolvedTurn]);
    const result = await summarizeDeadlock(session, 5, { callLLM });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings.length).toBeGreaterThan(0);
      // Should detect "delve" and "moreover"
      expect(result.warnings.join(" ")).toMatch(/delve|moreover/i);
    }
  });

  it("includes manager-override turns in the summary text", async () => {
    const callLLM = vi.fn().mockResolvedValueOnce("Override turn was present.");
    const overrideTurn = {
      kind: "manager-override" as const,
      at: new Date().toISOString(),
      summary: "Two turns of stalemate.",
      forcedOutcome: "Door broken down by manager.",
      turnsConsidered: 2,
    };
    const session = makeSession([overrideTurn]);
    const result = await summarizeDeadlock(session, 5, { callLLM });
    expect(result.ok).toBe(true);
    const callArgs = callLLM.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain("[Manager Override]");
  });
});
