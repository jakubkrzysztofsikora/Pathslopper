import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RedisSessionStore } from "@/lib/state/server/redis-session-store";
import { createIoRedisClient } from "@/lib/state/server/redis-client";
import type { RedisClient } from "@/lib/state/server/redis-client";

// No guards. REDIS_URL must be set or this fails hard.

describe("RedisSessionStore — real Scaleway Managed Redis", () => {
  let store: RedisSessionStore;
  let client: RedisClient;

  beforeAll(() => {
    const url = process.env.REDIS_URL!;
    client = createIoRedisClient(url);
    store = new RedisSessionStore(client, 300); // short TTL for test cleanup
  });

  afterAll(async () => {
    await store._reset();
    await client.disconnect();
  });

  it("create + get round-trip", async () => {
    const session = await store.create("pf2e");
    expect(session.id).toBeTruthy();
    expect(session.version).toBe("pf2e");

    const fetched = await store.get(session.id);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(session.id);
    expect(fetched!.version).toBe("pf2e");
    expect(fetched!.turns).toEqual([]);
  });

  it("appendResolved persists turn", async () => {
    const session = await store.create("pf2e");
    const updated = await store.appendResolved(session.id, {
      intent: {
        version: "pf2e",
        action: "strike",
        description: "I attack the goblin",
        rawInput: "I attack the goblin",
      },
      result: {
        intent: {
          version: "pf2e",
          action: "strike",
          description: "I attack the goblin",
          rawInput: "I attack the goblin",
        },
        roll: {
          formula: "1d20+5",
          rolls: [14],
          modifiers: [{ label: "Attack", value: 5 }],
          total: 19,
          breakdown: "1d20 (14) + Attack +5 = 19",
        },
        outcome: "resolved",
        summary: "Strike: rolled 19",
      },
    });
    expect(updated).toBeDefined();
    expect(updated!.turns).toHaveLength(1);
    expect(updated!.turns[0].kind).toBe("resolved");

    // Verify persistence
    const refetched = await store.get(session.id);
    expect(refetched!.turns).toHaveLength(1);
  });

  it("addCharacter persists and rejects duplicates", async () => {
    const session = await store.create("pf2e");
    const character = {
      version: "pf2e" as const,
      name: "Valeros",
      ancestry: "Human",
      background: "Warrior",
      class: "Fighter",
      level: 5,
      actionTags: ["Strike", "Shield Block"],
      proficiencies: { athletics: "expert" as const },
      abilityScores: { str: 18, dex: 14, con: 14, int: 10, wis: 12, cha: 10 },
    };

    const updated = await store.addCharacter(session.id, character);
    expect(updated).toBeDefined();
    expect(updated!.characters).toHaveLength(1);
    expect(updated!.characters[0].name).toBe("Valeros");

    // Duplicate should throw
    await expect(store.addCharacter(session.id, character)).rejects.toThrow();
  });

  it("setActiveOverride + clearActiveOverride lifecycle", async () => {
    const session = await store.create("pf2e");

    const withOverride = await store.setActiveOverride(
      session.id,
      "The dragon flees",
      "Summary of deadlock",
      3,
    );
    expect(withOverride).toBeDefined();
    expect(withOverride!.activeOverride).toBeDefined();
    expect(withOverride!.activeOverride!.forcedOutcome).toBe("The dragon flees");

    // Should have a manager-override turn in the log
    const overrideTurn = withOverride!.turns.find(t => t.kind === "manager-override");
    expect(overrideTurn).toBeDefined();

    const cleared = await store.clearActiveOverride(session.id);
    expect(cleared).toBeDefined();
    expect(cleared!.activeOverride).toBeNull();
  });
});
