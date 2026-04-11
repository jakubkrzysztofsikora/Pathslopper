import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionBrief } from "@/lib/schemas/session-brief";
import { generateSession } from "@/lib/orchestration/generate-session";
import { SessionGraphSchema } from "@/lib/schemas/session-graph";
import type { CallLLM } from "@/lib/llm/client";

import stageAFixture from "./fixtures/generate-session/stage-a.json";
import stageBFixture from "./fixtures/generate-session/stage-b.json";
import stageCFixture from "./fixtures/generate-session/stage-c.json";
import stageDFixture from "./fixtures/generate-session/stage-d.json";
import stageEFixture from "./fixtures/generate-session/stage-e.json";
import stageFFixture from "./fixtures/generate-session/stage-f.json";

const MINIMAL_BRIEF: SessionBrief = {
  version: "pf2e",
  partySize: 4,
  partyLevel: 3,
  targetDurationHours: 4,
  tone: "heroic",
  setting: "ruiny starożytnej twierdzy",
  presetId: "classic",
  storyDna: {
    version: "pf2e",
    sliders: {
      narrativePacing: 5,
      tacticalLethality: 5,
      npcImprov: 5,
    },
    tags: { include: [], exclude: [] },
  },
  characterHooks: [],
  safetyTools: { lines: [], veils: [], xCardEnabled: true },
};

/**
 * Build a callLLM mock that returns fixture outputs in order:
 * call 1 → Stage A, call 2 → Stage B, ..., call 6 → Stage F.
 * Extra calls return an empty JSON object (for repair path tests).
 */
function buildHappyPathMock(): CallLLM {
  const responses = [
    JSON.stringify(stageAFixture),
    JSON.stringify(stageBFixture),
    JSON.stringify(stageCFixture),
    JSON.stringify(stageDFixture),
    JSON.stringify(stageEFixture),
    JSON.stringify(stageFFixture),
  ];
  let callIndex = 0;
  return vi.fn().mockImplementation(() => {
    const response = responses[callIndex] ?? "{}";
    callIndex++;
    return Promise.resolve(response);
  });
}

describe("generateSession", () => {
  describe("happy path: all 6 stages return valid JSON", () => {
    it("assembled graph passes SessionGraphSchema.parse", async () => {
      const mockCallLLM = buildHappyPathMock();
      const result = await generateSession(MINIMAL_BRIEF, { callLLM: mockCallLLM });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Must be 6 calls (one per stage, no retries)
      expect(mockCallLLM).toHaveBeenCalledTimes(6);

      // The assembled graph must pass the full schema including superRefine
      const parseResult = SessionGraphSchema.safeParse(result.graph);
      if (!parseResult.success) {
        const errors = parseResult.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`);
        throw new Error(`SessionGraph parse failed:\n${errors.join("\n")}`);
      }

      expect(result.graph.version).toBe("pf2e");
      expect(result.graph.nodes.length).toBeGreaterThanOrEqual(8);
      expect(result.graph.fronts).toHaveLength(1);
      expect(result.graph.clocks).toHaveLength(2);
      expect(result.graph.secrets).toHaveLength(6);
      expect(result.graph.npcs).toHaveLength(3);
      expect(result.graph.locations).toHaveLength(3);
      expect(result.graph.endings).toHaveLength(2);
    });
  });

  describe("Stage A parse failure", () => {
    it("triggers retry; second attempt succeeds", async () => {
      let callCount = 0;
      const responses = [
        "NOT JSON",                           // Stage A first attempt — bad
        JSON.stringify(stageAFixture),        // Stage A retry — good
        JSON.stringify(stageBFixture),
        JSON.stringify(stageCFixture),
        JSON.stringify(stageDFixture),
        JSON.stringify(stageEFixture),
        JSON.stringify(stageFFixture),
      ];
      const mockCallLLM: CallLLM = vi.fn().mockImplementation(() => {
        const r = responses[callCount] ?? "{}";
        callCount++;
        return Promise.resolve(r);
      });

      const result = await generateSession(MINIMAL_BRIEF, { callLLM: mockCallLLM });

      expect(result.ok).toBe(true);
      // 7 calls: A(fail) + A(retry) + B + C + D + E + F
      expect(mockCallLLM).toHaveBeenCalledTimes(7);

      // The retry call should have 3 messages (user, assistant=bad output, user=fix instruction)
      const retryCall = (mockCallLLM as ReturnType<typeof vi.fn>).mock.calls[1][0];
      expect(retryCall.messages).toHaveLength(3);
      expect(retryCall.messages[1].role).toBe("assistant");
      expect(retryCall.messages[2].role).toBe("user");
      expect(retryCall.messages[2].content).toMatch(/JSON/);
    });

    it("returns ok:false with stage='A' when retry also fails", async () => {
      const mockCallLLM: CallLLM = vi.fn()
        .mockResolvedValue("INVALID JSON");

      const result = await generateSession(MINIMAL_BRIEF, { callLLM: mockCallLLM });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.stage).toBe("A");
      // 2 calls: first attempt + retry
      expect(mockCallLLM).toHaveBeenCalledTimes(2);
    });
  });

  describe("validation repair path", () => {
    it("repair is called when assembled graph fails final parse", async () => {
      // Stage D fixture has an ending referencing "front-1" in frontOutcomes,
      // but assembleGraph generates front ids as "front-1", "front-2" etc.
      // We force the repair path by returning a stage D that has a bad edge reference.
      const badStageDJson = JSON.stringify({
        ...stageDFixture,
        edges: [
          ...stageDFixture.edges,
          {
            id: "e-bad",
            from: "sc-start",
            to: "sc-nonexistent",   // references a node that doesn't exist
            kind: "auto",
            onTraverseEffects: [],
            priority: 0,
          },
        ],
      });

      // The repair LLM call returns the good stage D result assembled as a full graph.
      // We can't easily return a valid full SessionGraph from the repair since it's too
      // large to build inline. Instead we verify the repair was CALLED and returns
      // ok:false on repair failure.
      let callCount = 0;
      const responses = [
        JSON.stringify(stageAFixture),
        JSON.stringify(stageBFixture),
        JSON.stringify(stageCFixture),
        badStageDJson,              // Stage D — bad edge referent
        JSON.stringify(stageEFixture),
        JSON.stringify(stageFFixture),
        "REPAIR FAILED",            // Repair call — returns invalid JSON
      ];
      const mockCallLLM: CallLLM = vi.fn().mockImplementation(() => {
        const r = responses[callCount] ?? "{}";
        callCount++;
        return Promise.resolve(r);
      });

      const result = await generateSession(MINIMAL_BRIEF, { callLLM: mockCallLLM });

      // The repair was called (7th call)
      expect(mockCallLLM).toHaveBeenCalledTimes(7);

      // Repair returned invalid JSON → ok:false with stage='validate'
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.stage).toBe("validate");
    });

    it("returns ok:false stage='validate' when repair LLM call throws", async () => {
      const badStageDJson = JSON.stringify({
        ...stageDFixture,
        edges: [
          ...stageDFixture.edges,
          {
            id: "e-bad",
            from: "sc-start",
            to: "sc-nonexistent",
            kind: "auto",
            onTraverseEffects: [],
            priority: 0,
          },
        ],
      });

      let callCount = 0;
      const responses = [
        JSON.stringify(stageAFixture),
        JSON.stringify(stageBFixture),
        JSON.stringify(stageCFixture),
        badStageDJson,
        JSON.stringify(stageEFixture),
        JSON.stringify(stageFFixture),
      ];
      const mockCallLLM: CallLLM = vi.fn().mockImplementation(() => {
        const r = responses[callCount];
        callCount++;
        if (r === undefined) return Promise.reject(new Error("Upstream failed"));
        return Promise.resolve(r);
      });

      const result = await generateSession(MINIMAL_BRIEF, { callLLM: mockCallLLM });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.stage).toBe("validate");
    });
  });
});
