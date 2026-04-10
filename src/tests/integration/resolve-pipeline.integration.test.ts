import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolveInteraction } from "@/lib/orchestration/resolve-interaction";
import { callLLM } from "@/lib/llm/client";
import { RedisSessionStore } from "@/lib/state/server/redis-session-store";
import { createIoRedisClient } from "@/lib/state/server/redis-client";
import type { RedisClient } from "@/lib/state/server/redis-client";

// No guards. Both LLM_API_KEY and REDIS_URL must be set.

describe("resolveInteraction — full pipeline with real LLM + Redis", () => {
  let store: RedisSessionStore;
  let client: RedisClient;

  beforeAll(() => {
    const url = process.env.REDIS_URL!;
    client = createIoRedisClient(url);
    store = new RedisSessionStore(client, 300);
  });

  afterAll(async () => {
    await store._reset();
    await client.disconnect();
  });

  it("resolves raw input through LLM optimization + dice + session persistence", async () => {
    const session = await store.create("pf2e");

    const result = await resolveInteraction(
      {
        rawInput: "I swing my longsword at the goblin",
        version: "pf2e",
        overrideModifier: 5,
        overrideDc: 15,
        sessionId: session.id,
      },
      {
        callLLM,
        sessionStore: store,
        adjudicateOptions: { seed: 42 },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The LLM should have optimized the input into a PlayerIntent
    expect(result.result.intent.action).toBeTruthy();
    expect(result.result.roll.total).toBeGreaterThan(0);
    expect(result.result.summary).toBeTruthy();

    // Session should have the turn persisted
    expect(result.session).toBeDefined();
    expect(result.session!.turns).toHaveLength(1);
    expect(result.session!.turns[0].kind).toBe("resolved");

    // Verify it's in Redis
    const refetched = await store.get(session.id);
    expect(refetched!.turns).toHaveLength(1);
  });

  it("consumes activeOverride and produces synthetic result", async () => {
    const session = await store.create("pf2e");

    // Set an override
    await store.setActiveOverride(
      session.id,
      "The goblin surrenders",
      "Summary",
      1,
    );

    const result = await resolveInteraction(
      {
        rawInput: "I attack again",
        version: "pf2e",
        sessionId: session.id,
      },
      {
        callLLM,
        sessionStore: store,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Should have used the forced outcome
    expect(result.result.summary).toContain("The goblin surrenders");
    expect(result.result.roll.breakdown).toContain("manager override");

    // Override should be cleared
    const refetched = await store.get(session.id);
    expect(refetched!.activeOverride).toBeNull();
  });
});
