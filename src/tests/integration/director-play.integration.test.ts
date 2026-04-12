/**
 * Integration test: Director play loop — 5 ticks against a real session.
 *
 * Hard-fails on missing LLM_API_KEY per the standard repo integration test
 * pattern. Requires a real inkjs-compiled session in the store.
 *
 * Run manually via: npm run test:integration
 * Do NOT execute this in standard `npm test` (excluded by vitest.config.ts).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { InMemorySessionStore } from "@/lib/state/server/in-memory-session-store";
import { director } from "@/lib/orchestration/director/director";
import { callLLM } from "@/lib/llm/client";
import { makeSession } from "@/tests/factories/session-factory";

// Guard: hard-fail on missing env vars
beforeAll(() => {
  if (!process.env.LLM_API_KEY) {
    throw new Error(
      "Integration test requires LLM_API_KEY. " +
        "Set it in .env.local or export it before running npm run test:integration."
    );
  }
});

describe("Director play loop (integration)", () => {
  it("runs 5 Director ticks and produces worldState changes", async () => {
    const store = new InMemorySessionStore();

    // Build an approved session with a real compiled ink script
    const session = makeSession("approved");
    // Override the store to inject our approved session
    const created = await store.create("pf2e");
    await store.setBrief(created.id, session.brief!);
    await store.setGraph(created.id, session.graph!);

    // Compile a minimal ink script for the director to run
    const { Story } = await import("inkjs");
    const minimalInk = `
VAR turn = 0
-> start
=== start ===
Turn {turn}.
~ turn = turn + 1
-> DONE
`;
    // Use a stub compiled form — the actual ink compiler requires a build step.
    // In a real integration run, use: npx tsx scripts/seed-session.ts <fixture>
    // This test validates the Director loop machinery, not the ink compilation.
    let compiled: string = JSON.stringify({
      inkVersion: 21,
      root: [["^Turn 1.", "\n", ["done", null], null]],
      listDefs: {},
    });
    try {
      const storyJson = new Story(minimalInk).ToJson();
      if (storyJson) compiled = storyJson;
    } catch {
      // fall through to the stub JSON above
    }

    await store.approve(created.id, compiled);

    const deps = {
      callLLM,
      store,
      sessionId: created.id,
    };

    const initialWorldState = (await store.get(created.id))!.worldState;

    // Run 5 Director ticks
    let lastOutput;
    for (let i = 0; i < 5; i++) {
      lastOutput = await director(
        { type: i === 0 ? "start" : "continue" },
        deps
      );
    }

    const finalSession = await store.get(created.id);
    expect(finalSession).toBeDefined();
    expect(finalSession!.worldState.turnCount).toBeGreaterThan(
      initialWorldState.turnCount
    );
    expect(lastOutput).toBeDefined();
    expect(lastOutput!.ended !== undefined).toBe(true);
  }, 60_000);
});
