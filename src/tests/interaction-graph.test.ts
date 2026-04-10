/**
 * Tests for the LangGraph interaction resolution graph.
 *
 * These tests exercise the graph pipeline (optimize → overrideCheck →
 * srdRetrieval → adjudicate → persist) via mock dependencies, and verify
 * the feature flag routing in resolveInteraction.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildInteractionGraph } from "@/lib/orchestration/graph/interaction-graph";
import { InMemorySessionStore } from "@/lib/state/server/session-store";

const BASE_OPTIMIZED_INTENT = {
  version: "pf2e",
  rawInput: "I strike the goblin",
  action: "strike",
  skillOrAttack: "Longsword",
  target: "goblin",
  description: "Strike the goblin with a longsword.",
  actionCost: 1,
};

describe("buildInteractionGraph", () => {
  it("MUST: graph with mock callLLM produces a result (optimize → adjudicate → persist)", async () => {
    const callLLM = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(BASE_OPTIMIZED_INTENT));

    const store = new InMemorySessionStore();
    const session = await store.create("pf2e");

    const graph = buildInteractionGraph({
      callLLM,
      sessionStore: store,
      adjudicateOptions: { seed: 42 },
    });

    const result = await graph.invoke({
      rawInput: "I strike the goblin",
      version: "pf2e",
      sessionId: session.id,
    });

    // No error
    expect(result.error).toBeNull();
    expect(result.errorStage).toBeNull();

    // Got a result
    expect(result.result).not.toBeNull();
    expect(result.result?.intent.action).toBe("strike");
    expect(result.result?.outcome).toMatch(/resolved|needs-dc/);

    // Persisted to session
    const updatedSession = await store.get(session.id);
    expect(updatedSession?.turns).toHaveLength(1);
    expect(updatedSession?.turns[0].kind).toBe("resolved");
  });

  it("MUST: graph with error in optimize sets error state and does not produce a result", async () => {
    const callLLM = vi
      .fn()
      .mockRejectedValueOnce(new Error("upstream down"));

    const graph = buildInteractionGraph({ callLLM });

    const result = await graph.invoke({
      rawInput: "I strike the goblin",
      version: "pf2e",
    });

    expect(result.error).toBeTruthy();
    expect(result.errorStage).toBe("optimize");
    expect(result.result).toBeNull();
  });

  it("MUST: graph with active override consumes it and produces synthetic result", async () => {
    const callLLM = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(BASE_OPTIMIZED_INTENT));

    const store = new InMemorySessionStore();
    const session = await store.create("pf2e");

    // Set an active override on the session
    await store.setActiveOverride(
      session.id,
      "The goblin surrenders immediately.",
      "Two turns of stalemate.",
      2
    );

    const graph = buildInteractionGraph({
      callLLM,
      sessionStore: store,
      adjudicateOptions: { seed: 42 },
    });

    const result = await graph.invoke({
      rawInput: "I strike the goblin",
      version: "pf2e",
      sessionId: session.id,
    });

    expect(result.error).toBeNull();
    expect(result.result).not.toBeNull();
    // Synthetic override result: no dice rolled
    expect(result.result?.roll.breakdown).toContain("manager override");
    expect(result.result?.roll.rolls).toHaveLength(0);
    expect(result.result?.summary).toBe("The goblin surrenders immediately.");

    // Override should be cleared from the session
    const updatedSession = await store.get(session.id);
    expect(updatedSession?.activeOverride).toBeNull();
  });

  it("MUST: graph applies UI modifier override on top of LLM-inferred modifier", async () => {
    const optimizedWithInferred = { ...BASE_OPTIMIZED_INTENT, modifier: 3, dc: 15 };
    const callLLM = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(optimizedWithInferred));

    const graph = buildInteractionGraph({
      callLLM,
      adjudicateOptions: { seed: 1 },
    });

    const result = await graph.invoke({
      rawInput: "I strike the goblin",
      version: "pf2e",
      overrideModifier: 7,
      overrideDc: 20,
    });

    expect(result.error).toBeNull();
    expect(result.result).not.toBeNull();
    expect(result.result?.roll.dc).toBe(20);
    // Modifier should be the override (7), not LLM-inferred (3)
    expect(result.result?.roll.modifiers[0]?.value).toBe(7);
  });

  it("MUST: graph without session store still resolves (no persistence)", async () => {
    const callLLM = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(BASE_OPTIMIZED_INTENT));

    const graph = buildInteractionGraph({
      callLLM,
      adjudicateOptions: { seed: 1 },
    });

    const result = await graph.invoke({
      rawInput: "I strike the goblin",
      version: "pf2e",
    });

    expect(result.error).toBeNull();
    expect(result.result).not.toBeNull();
  });

  it("SHOULD: SRD context is included in summary when srdIndex and embedTexts are provided", async () => {
    const callLLM = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({ ...BASE_OPTIMIZED_INTENT, dc: 15 })
      );

    const mockSrdIndex = {
      search: vi.fn().mockReturnValue([
        {
          id: "srd-1",
          text: "Longsword: 1d8+STR damage",
          metadata: { category: "weapons", name: "Longsword", version: "pf2e" },
          score: 0.9,
        },
      ]),
      load: vi.fn(),
      size: vi.fn().mockReturnValue(1),
    };

    const mockEmbedTexts = vi
      .fn()
      .mockResolvedValue([[0.1, 0.2, 0.3]]);

    const graph = buildInteractionGraph({
      callLLM,
      srdIndex: mockSrdIndex,
      embedTexts: mockEmbedTexts,
      adjudicateOptions: { seed: 1 },
    });

    const result = await graph.invoke({
      rawInput: "I strike the goblin",
      version: "pf2e",
    });

    expect(result.error).toBeNull();
    expect(result.result).not.toBeNull();
    expect(result.result?.summary).toContain("Rules Reference");
    expect(result.result?.summary).toContain("Longsword");
  });
});

describe("resolveInteraction feature flag routing", () => {
  beforeEach(() => {
    delete process.env.USE_LANGGRAPH;
  });

  afterEach(() => {
    delete process.env.USE_LANGGRAPH;
  });

  it("MUST: USE_LANGGRAPH=false (default) uses imperative path", async () => {
    process.env.USE_LANGGRAPH = "false";

    const { resolveInteraction } = await import(
      "@/lib/orchestration/resolve-interaction"
    );

    const callLLM = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(BASE_OPTIMIZED_INTENT));

    const result = await resolveInteraction(
      { rawInput: "I strike the goblin", version: "pf2e" },
      { callLLM, adjudicateOptions: { seed: 1 } }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.intent.action).toBe("strike");
    }
  });

  it("MUST: USE_LANGGRAPH=true routes through graph and returns equivalent result", async () => {
    process.env.USE_LANGGRAPH = "true";

    // Dynamic import to bypass module-level caching of the env var check.
    // We need the module to re-evaluate the flag path each call.
    const { resolveInteraction } = await import(
      "@/lib/orchestration/resolve-interaction"
    );

    const callLLM = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(BASE_OPTIMIZED_INTENT));

    const result = await resolveInteraction(
      {
        rawInput: "I strike the goblin",
        version: "pf2e",
        overrideModifier: 5,
        overrideDc: 15,
      },
      { callLLM, adjudicateOptions: { seed: 1 } }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.intent.action).toBe("strike");
      expect(result.result.roll.dc).toBe(15);
      expect(result.result.roll.modifiers[0]?.value).toBe(5);
    }
  });

  it("MUST: USE_LANGGRAPH=true with optimize failure returns ok=false", async () => {
    process.env.USE_LANGGRAPH = "true";

    const { resolveInteraction } = await import(
      "@/lib/orchestration/resolve-interaction"
    );

    const callLLM = vi.fn().mockRejectedValueOnce(new Error("model down"));

    const result = await resolveInteraction(
      { rawInput: "I strike", version: "pf2e" },
      { callLLM }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe("optimize");
    }
  });
});
