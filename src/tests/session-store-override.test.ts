import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemorySessionStore,
  buildManagerOverrideTurn,
} from "@/lib/state/server/session-store";
import {
  ManagerOverrideTurnSchema,
  SessionStateSchema,
} from "@/lib/schemas/session";

describe("ManagerOverrideTurn schema", () => {
  it("validates a correctly shaped manager-override turn", () => {
    const turn = {
      kind: "manager-override",
      at: new Date().toISOString(),
      summary: "Two turns of stalemate at the locked door.",
      forcedOutcome: "The party breaks the door down with a combined effort.",
      turnsConsidered: 3,
    };
    const result = ManagerOverrideTurnSchema.safeParse(turn);
    expect(result.success).toBe(true);
  });

  it("rejects manager-override turn with empty summary", () => {
    const turn = {
      kind: "manager-override",
      at: new Date().toISOString(),
      summary: "",
      forcedOutcome: "Something happens.",
      turnsConsidered: 1,
    };
    const result = ManagerOverrideTurnSchema.safeParse(turn);
    expect(result.success).toBe(false);
  });

  it("rejects manager-override turn with turnsConsidered = 0", () => {
    const turn = {
      kind: "manager-override",
      at: new Date().toISOString(),
      summary: "Deadlock detected.",
      forcedOutcome: "Outcome forced.",
      turnsConsidered: 0,
    };
    const result = ManagerOverrideTurnSchema.safeParse(turn);
    expect(result.success).toBe(false);
  });
});

describe("buildManagerOverrideTurn", () => {
  it("produces a correctly shaped manager-override turn with auto at", () => {
    const turn = buildManagerOverrideTurn({
      summary: "Test summary.",
      forcedOutcome: "Test forced outcome.",
      turnsConsidered: 2,
    });
    expect(turn.kind).toBe("manager-override");
    expect(turn.summary).toBe("Test summary.");
    expect(turn.forcedOutcome).toBe("Test forced outcome.");
    expect(turn.turnsConsidered).toBe(2);
    expect(typeof turn.at).toBe("string");
    // Should be a valid ISO datetime
    expect(() => new Date(turn.at)).not.toThrow();
  });

  it("uses provided at timestamp when given", () => {
    const at = "2025-01-15T10:00:00.000Z";
    const turn = buildManagerOverrideTurn({
      summary: "Summary.",
      forcedOutcome: "Outcome.",
      turnsConsidered: 1,
      at,
    });
    expect(turn.at).toBe(at);
  });
});

describe("SessionStateSchema activeOverride field", () => {
  it("defaults activeOverride to null when not provided", () => {
    const raw = {
      id: "abcdefghijk12345",
      version: "pf2e",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      turns: [],
      characters: [],
    };
    const result = SessionStateSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.activeOverride).toBeNull();
    }
  });

  it("accepts activeOverride with forcedOutcome and setAt", () => {
    const raw = {
      id: "abcdefghijk12345",
      version: "pf2e",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      turns: [],
      characters: [],
      activeOverride: {
        forcedOutcome: "The door breaks down.",
        setAt: new Date().toISOString(),
      },
    };
    const result = SessionStateSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.activeOverride).not.toBeNull();
      expect(result.data.activeOverride?.forcedOutcome).toBe("The door breaks down.");
    }
  });

  it("accepts null for activeOverride explicitly", () => {
    const raw = {
      id: "abcdefghijk12345",
      version: "pf2e",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      turns: [],
      characters: [],
      activeOverride: null,
    };
    const result = SessionStateSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.activeOverride).toBeNull();
    }
  });
});

describe("InMemorySessionStore override methods", () => {
  const store = new InMemorySessionStore();

  beforeEach(async () => {
    await store._reset();
  });

  it("setActiveOverride creates override and appends manager-override turn", async () => {
    const session = await store.create("pf2e");
    const updated = await store.setActiveOverride(
      session.id,
      "The party breaks the door down.",
      "Two turns of stalemate at the locked door.",
      3
    );
    expect(updated).toBeDefined();
    expect(updated?.activeOverride).not.toBeNull();
    expect(updated?.activeOverride?.forcedOutcome).toBe("The party breaks the door down.");
    expect(updated?.turns).toHaveLength(1);
    expect(updated?.turns[0].kind).toBe("manager-override");
    if (updated?.turns[0].kind === "manager-override") {
      expect(updated.turns[0].summary).toBe("Two turns of stalemate at the locked door.");
      expect(updated.turns[0].forcedOutcome).toBe("The party breaks the door down.");
      expect(updated.turns[0].turnsConsidered).toBe(3);
    }
  });

  it("setActiveOverride returns undefined for unknown session", async () => {
    const result = await store.setActiveOverride(
      "nonexistent-id-xxx",
      "Outcome.",
      "Summary.",
      1
    );
    expect(result).toBeUndefined();
  });

  it("clearActiveOverride sets activeOverride back to null", async () => {
    const session = await store.create("pf2e");
    await store.setActiveOverride(
      session.id,
      "Forced outcome.",
      "Summary.",
      2
    );
    const cleared = await store.clearActiveOverride(session.id);
    expect(cleared).toBeDefined();
    expect(cleared?.activeOverride).toBeNull();
  });

  it("clearActiveOverride returns undefined for unknown session", async () => {
    const result = await store.clearActiveOverride("nonexistent-id-xxx");
    expect(result).toBeUndefined();
  });

  it("session state is schema-valid after setActiveOverride", async () => {
    const session = await store.create("pf2e");
    const updated = await store.setActiveOverride(
      session.id,
      "Outcome.",
      "Summary.",
      1
    );
    expect(SessionStateSchema.safeParse(updated).success).toBe(true);
  });
});
