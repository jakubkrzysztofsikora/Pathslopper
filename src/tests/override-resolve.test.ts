import { describe, it, expect, vi } from "vitest";
import { resolveInteraction } from "@/lib/orchestration/resolve-interaction";
import { getSessionStore } from "@/lib/state/server/store-factory";
import { pl } from "@/lib/i18n";

const optimizedIntent = {
  version: "pf2e",
  rawInput: "I attempt to pick the lock",
  action: "skill-check",
  skillOrAttack: "Thievery",
  target: "lock",
  description: "Pick the lock with Thievery.",
  actionCost: 1,
};

describe("resolveInteraction with active override", () => {
  it("when session has activeOverride, produces synthetic result using forcedOutcome", async () => {
    const store = getSessionStore();
    await store._reset();
    const session = await store.create("pf2e");

    // Set an active override
    await store.setActiveOverride(
      session.id,
      "The lock clicks open as the rogue's skilled fingers find purchase.",
      "Summary of two failed attempts.",
      2
    );

    const callLLM = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(optimizedIntent));

    const result = await resolveInteraction(
      {
        rawInput: "I attempt to pick the lock",
        version: "pf2e",
        sessionId: session.id,
      },
      { callLLM, sessionStore: store, adjudicateOptions: { seed: 1 } }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.summary).toBe(
        "The lock clicks open as the rogue's skilled fingers find purchase."
      );
      // Should not have actually rolled dice
      expect(result.result.roll.rolls).toHaveLength(0);
      expect(result.result.roll.breakdown).toBe(
        pl.adjudication.managerOverrideNoRoll
      );
    }
    // callLLM must NOT be invoked — the override bypass is LLM-independent
    expect(callLLM).not.toHaveBeenCalled();
  });

  it("after consuming the override, activeOverride is cleared", async () => {
    const store = getSessionStore();
    await store._reset();
    const session = await store.create("pf2e");

    await store.setActiveOverride(
      session.id,
      "Forced outcome here.",
      "Summary.",
      1
    );

    const callLLM = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(optimizedIntent));

    await resolveInteraction(
      {
        rawInput: "I do something",
        version: "pf2e",
        sessionId: session.id,
      },
      { callLLM, sessionStore: store }
    );

    const after = await store.get(session.id);
    expect(after?.activeOverride).toBeNull();
    // callLLM must NOT be invoked on the override bypass path
    expect(callLLM).not.toHaveBeenCalled();
  });

  it("after consuming the override, a resolved turn is appended", async () => {
    const store = getSessionStore();
    await store._reset();
    const session = await store.create("pf2e");

    await store.setActiveOverride(
      session.id,
      "Forced outcome.",
      "Summary.",
      1
    );

    const callLLM = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(optimizedIntent));

    const result = await resolveInteraction(
      {
        rawInput: "I act",
        version: "pf2e",
        sessionId: session.id,
      },
      { callLLM, sessionStore: store }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      // There should be the manager-override turn + the resolved turn
      const after = await store.get(session.id);
      const resolvedTurns = after?.turns.filter((t) => t.kind === "resolved");
      expect(resolvedTurns?.length).toBeGreaterThanOrEqual(1);
    }
    // callLLM must NOT be invoked on the override bypass path
    expect(callLLM).not.toHaveBeenCalled();
  });
});
