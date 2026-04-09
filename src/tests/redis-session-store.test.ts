import { describe, it, expect, beforeEach } from "vitest";
import { RedisSessionStore } from "@/lib/state/server/redis-session-store";
import type { RedisClient } from "@/lib/state/server/redis-client";
import { SessionIdSchema } from "@/lib/schemas/session";
import type { PlayerIntent } from "@/lib/schemas/player-intent";
import type { AdjudicationResult } from "@/lib/schemas/adjudication";

/**
 * Minimal in-process Redis client stand-in. The RedisSessionStore only
 * uses get / setWithTtl / del / exists / countKeys / deleteByPattern, so
 * a Map-backed implementation is sufficient for unit tests. No
 * testcontainers, no docker, no network.
 */
class FakeRedisClient implements RedisClient {
  private readonly data = new Map<string, { value: string; ttl: number }>();
  public readonly ops: string[] = [];

  async get(key: string): Promise<string | null> {
    this.ops.push(`get:${key}`);
    const entry = this.data.get(key);
    return entry ? entry.value : null;
  }
  async setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.ops.push(`set:${key}:ttl=${ttlSeconds}`);
    this.data.set(key, { value, ttl: ttlSeconds });
  }
  async del(key: string): Promise<void> {
    this.ops.push(`del:${key}`);
    this.data.delete(key);
  }
  async exists(key: string): Promise<boolean> {
    return this.data.has(key);
  }
  async countKeys(pattern: string): Promise<number> {
    const re = patternToRegex(pattern);
    return Array.from(this.data.keys()).filter((k) => re.test(k)).length;
  }
  async deleteByPattern(pattern: string): Promise<void> {
    const re = patternToRegex(pattern);
    for (const k of Array.from(this.data.keys())) {
      if (re.test(k)) this.data.delete(k);
    }
  }
  async disconnect(): Promise<void> {}

  /** Test helper: current TTL for a key, or undefined if absent. */
  ttlFor(key: string): number | undefined {
    return this.data.get(key)?.ttl;
  }
}

function patternToRegex(pattern: string): RegExp {
  // Simple * -> .* conversion with escape of other regex chars. Matches
  // the glob semantics of the Redis KEYS/SCAN patterns we use.
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function makeIntent(): PlayerIntent {
  return {
    version: "pf2e",
    rawInput: "I swing at the goblin",
    action: "strike",
    skillOrAttack: "Longsword",
    target: "goblin",
    description: "Strike the goblin with a longsword.",
    modifier: 5,
    dc: 15,
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

describe("RedisSessionStore", () => {
  let fake: FakeRedisClient;
  let store: RedisSessionStore;

  beforeEach(() => {
    fake = new FakeRedisClient();
    store = new RedisSessionStore(fake, 3600);
  });

  it("create() writes the session JSON under a prefixed key with TTL", async () => {
    const session = await store.create("pf2e");
    expect(SessionIdSchema.safeParse(session.id).success).toBe(true);
    expect(fake.ttlFor(`pfnexus:session:${session.id}`)).toBe(3600);
  });

  it("get() round-trips a created session", async () => {
    const session = await store.create("pf1e");
    const fetched = await store.get(session.id);
    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe(session.id);
    expect(fetched?.version).toBe("pf1e");
    expect(fetched?.turns).toHaveLength(0);
  });

  it("get() returns undefined for unknown IDs", async () => {
    expect(await store.get("notfound")).toBeUndefined();
  });

  it("get() returns undefined (not throws) when the stored JSON is corrupt", async () => {
    await fake.setWithTtl("pfnexus:session:corrupt", "{bad json", 3600);
    expect(await store.get("corrupt")).toBeUndefined();
  });

  it("get() returns undefined when the stored data fails schema validation", async () => {
    await fake.setWithTtl(
      "pfnexus:session:badschema",
      JSON.stringify({ id: "short", version: "pf4e" }),
      3600
    );
    expect(await store.get("badschema")).toBeUndefined();
  });

  it("appendResolved() adds a turn and bumps TTL", async () => {
    const session = await store.create("pf2e");
    const intent = makeIntent();
    const next = await store.appendResolved(session.id, {
      intent,
      result: makeResult(intent),
    });
    expect(next?.turns).toHaveLength(1);
    expect(next?.turns[0].kind).toBe("resolved");
    expect(fake.ttlFor(`pfnexus:session:${session.id}`)).toBe(3600);
  });

  it("appendNarration() writes the current world-state hash", async () => {
    const session = await store.create("pf2e");
    const h = await store.worldStateHash(session.id);
    const next = await store.appendNarration(session.id, "Damp stone.");
    expect(next?.turns).toHaveLength(1);
    if (next?.turns[0].kind === "narration") {
      expect(next.turns[0].worldStateHash).toBe(h);
    }
  });

  it("worldStateHash() changes after an append", async () => {
    const session = await store.create("pf2e");
    const h0 = await store.worldStateHash(session.id);
    await store.appendNarration(session.id, "Opening beat.");
    const h1 = await store.worldStateHash(session.id);
    expect(h1).not.toBe(h0);
  });

  it("appendResolved() returns undefined for unknown sessions", async () => {
    const intent = makeIntent();
    const result = await store.appendResolved("missing", {
      intent,
      result: makeResult(intent),
    });
    expect(result).toBeUndefined();
  });

  it("size() counts only session-prefixed keys", async () => {
    await store.create("pf2e");
    await store.create("pf2e");
    await fake.setWithTtl("some-other-key", "x", 3600);
    expect(await store.size()).toBe(2);
  });

  it("_reset() deletes only session-prefixed keys", async () => {
    const a = await store.create("pf2e");
    await fake.setWithTtl("unrelated:key", "x", 3600);
    await store._reset();
    expect(await store.get(a.id)).toBeUndefined();
    expect(await fake.get("unrelated:key")).toBe("x");
  });

  it("uses the configured TTL when writing new sessions", async () => {
    const customStore = new RedisSessionStore(fake, 60);
    const session = await customStore.create("pf2e");
    expect(fake.ttlFor(`pfnexus:session:${session.id}`)).toBe(60);
  });
});
