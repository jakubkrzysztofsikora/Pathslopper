import { describe, it, expect, beforeEach } from "vitest";
import { getSessionStore, hashState } from "@/lib/state/server/session-store";
import { SessionIdSchema, SessionStateSchema } from "@/lib/schemas/session";
import type { PlayerIntent } from "@/lib/schemas/player-intent";
import type { AdjudicationResult } from "@/lib/schemas/adjudication";

function makeIntent(overrides: Partial<PlayerIntent> = {}): PlayerIntent {
  return {
    version: "pf2e",
    rawInput: "I swing my longsword at the goblin",
    action: "strike",
    skillOrAttack: "Longsword",
    target: "goblin",
    description: "Longsword strike against the goblin.",
    modifier: 5,
    dc: 15,
    ...overrides,
  };
}

function makeResult(intent: PlayerIntent): AdjudicationResult {
  return {
    intent,
    roll: {
      formula: "1d20 + 5 Longsword",
      rolls: [15],
      modifiers: [{ label: "Longsword", value: 5 }],
      total: 20,
      breakdown: "1d20(15) + 5 Longsword = 20 vs DC 15 — SUCCESS",
      dc: 15,
      degreeOfSuccess: "success",
    },
    outcome: "resolved",
    summary: "Longsword against goblin: rolled 20 — success.",
  };
}

describe("InMemorySessionStore", () => {
  const store = getSessionStore();

  beforeEach(() => {
    store._reset();
  });

  it("creates a session with a URL-safe id and empty turn log", () => {
    const session = store.create("pf2e");
    expect(SessionIdSchema.safeParse(session.id).success).toBe(true);
    expect(session.version).toBe("pf2e");
    expect(session.turns).toHaveLength(0);
    expect(session.createdAt).toBe(session.updatedAt);
  });

  it("persists sessions and returns them via get()", () => {
    const created = store.create("pf1e");
    const fetched = store.get(created.id);
    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.version).toBe("pf1e");
  });

  it("returns undefined for unknown session IDs", () => {
    expect(store.get("nonexistent-session-id")).toBeUndefined();
  });

  it("appendResolved adds a resolved turn and bumps updatedAt", async () => {
    const session = store.create("pf2e");
    // Small sleep so updatedAt differs from createdAt.
    await new Promise((r) => setTimeout(r, 2));
    const intent = makeIntent();
    const next = store.appendResolved(session.id, {
      intent,
      result: makeResult(intent),
    });
    expect(next).toBeDefined();
    expect(next?.turns).toHaveLength(1);
    expect(next?.turns[0].kind).toBe("resolved");
    expect(next?.updatedAt).not.toBe(session.createdAt);
  });

  it("appendNarration adds a narration turn with the current world-state hash", () => {
    const session = store.create("pf2e");
    const hashBefore = store.worldStateHash(session.id);
    const next = store.appendNarration(
      session.id,
      "The corridor reeks of damp stone."
    );
    expect(next).toBeDefined();
    expect(next?.turns).toHaveLength(1);
    expect(next?.turns[0].kind).toBe("narration");
    if (next?.turns[0].kind === "narration") {
      expect(next.turns[0].markdown).toContain("damp stone");
      expect(next.turns[0].worldStateHash).toBe(hashBefore);
    }
  });

  it("worldStateHash changes when turns are appended", () => {
    const session = store.create("pf2e");
    const h0 = store.worldStateHash(session.id);
    store.appendNarration(session.id, "Opening scene.");
    const h1 = store.worldStateHash(session.id);
    expect(h0).toBeDefined();
    expect(h1).toBeDefined();
    expect(h1).not.toBe(h0);
  });

  it("hashState is deterministic for identical session content", () => {
    const session = store.create("pf2e");
    const a = hashState(session);
    const b = hashState({ ...session });
    expect(a).toBe(b);
  });

  it("appendResolved returns undefined for unknown session", () => {
    const intent = makeIntent();
    const result = store.appendResolved("missing", {
      intent,
      result: makeResult(intent),
    });
    expect(result).toBeUndefined();
  });

  it("appendNarration returns undefined for unknown session", () => {
    const result = store.appendNarration("missing", "test");
    expect(result).toBeUndefined();
  });

  it("session state is schema-valid after appends", () => {
    const session = store.create("pf2e");
    const intent = makeIntent();
    const afterResolve = store.appendResolved(session.id, {
      intent,
      result: makeResult(intent),
    });
    expect(afterResolve).toBeDefined();
    expect(SessionStateSchema.safeParse(afterResolve).success).toBe(true);
    const afterNarration = store.appendNarration(session.id, "Scene text.");
    expect(SessionStateSchema.safeParse(afterNarration).success).toBe(true);
  });

  it("store is a singleton across getSessionStore() calls", () => {
    const a = getSessionStore();
    const b = getSessionStore();
    expect(a).toBe(b);
  });
});
