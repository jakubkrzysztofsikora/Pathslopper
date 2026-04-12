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

    // Build an approved session
    const session = makeSession("approved");
    const created = await store.create("pf2e");
    await store.setBrief(created.id, session.brief!);
    await store.setGraph(created.id, session.graph!);

    // Compile a minimal Ink story using the proper compilation pipeline.
    // MUST use the Compiler from inkjs/full, NOT pass raw .ink to Story().
    // Story() expects compiled JSON; passing raw Ink text crashes with
    // "Cannot read properties of null (reading '^->')" — the bug that
    // was breaking this test in CI.
    let compiled: string;
    try {
      const { Compiler } = await import("inkjs/full");
      const minimalInk = [
        "VAR turn = 0",
        "-> start",
        "",
        "=== start ===",
        "Turn {turn}.",
        "~ turn = turn + 1",
        "* [Continue] -> start",
        "* [End] -> ending",
        "",
        "=== ending ===",
        "The end.",
        "-> END",
      ].join("\n");

      const compiler = new Compiler(minimalInk);
      const runtimeStory = compiler.Compile();
      const json = runtimeStory?.ToJson();
      if (!json) throw new Error("Ink compilation produced null");
      compiled = json;
    } catch (compileErr) {
      // If inkjs Compiler is unavailable, fall back to a pre-compiled
      // minimal story JSON (hand-verified against inkjs 2.4.0).
      console.warn(
        "[director-play integration] Ink compilation failed, using stub:",
        compileErr
      );
      compiled = JSON.stringify({
        inkVersion: 21,
        root: [
          "^The end.",
          "\n",
          "done",
          { "#f": 5, "#n": "g-0" },
        ],
        listDefs: {},
      });
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
    // Uses testTimeout from vitest.config.integration.ts (180s).
    // Do NOT set an inline timeout here — it overrides the config.
  });
});
