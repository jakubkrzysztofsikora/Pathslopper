import { describe, it, expect, vi } from "vitest";
import { narrateScene } from "@/lib/orchestration/narrate-scene";
import type { SessionState } from "@/lib/schemas/session";

function makeSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    id: "session-test-1234",
    version: "pf2e",
    createdAt: "2026-04-09T00:00:00.000Z",
    updatedAt: "2026-04-09T00:00:00.000Z",
    turns: [],
    characters: [],
    ...overrides,
  };
}

describe("narrateScene orchestrator", () => {
  it("returns ok with clean markdown when the LLM produces slop-free prose", async () => {
    const callLLM = vi
      .fn()
      .mockResolvedValueOnce(
        "You stand at the threshold of a damp cellar. Water pools between flagstones."
      );

    const result = await narrateScene(
      { session: makeSession(), worldStateHash: "abc12345" },
      { callLLM }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.markdown).toContain("damp cellar");
      expect(result.warnings).toEqual([]);
      expect(result.worldStateHash).toBe("abc12345");
    }
  });

  it("surfaces banned-phrase warnings without failing the request", async () => {
    const callLLM = vi
      .fn()
      .mockResolvedValueOnce(
        "Moreover, the corridor reeks of damp stone. You delve deeper."
      );

    const result = await narrateScene(
      { session: makeSession(), worldStateHash: "abc12345" },
      { callLLM }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("moreover");
    }
  });

  it("passes the world-state hash into the system prompt", async () => {
    const callLLM = vi.fn().mockResolvedValueOnce("scene text");
    await narrateScene(
      { session: makeSession(), worldStateHash: "deadbeef1234" },
      { callLLM }
    );
    const call = callLLM.mock.calls[0][0];
    expect(call.system).toContain("deadbeef1234");
    expect(call.system).toContain("AUTHORITATIVE");
  });

  it("includes the scene seed in the user message when provided", async () => {
    const callLLM = vi.fn().mockResolvedValueOnce("scene text");
    await narrateScene(
      {
        session: makeSession(),
        worldStateHash: "abc12345",
        sceneSeed: "the party approaches the chapel",
      },
      { callLLM }
    );
    const call = callLLM.mock.calls[0][0];
    const userContent = call.messages[0].content;
    expect(userContent).toContain("approaches the chapel");
  });

  it("adapts system prompt to the session's Pathfinder version", async () => {
    const callLLM = vi.fn().mockResolvedValueOnce("scene");
    await narrateScene(
      {
        session: makeSession({ version: "pf1e" }),
        worldStateHash: "abc12345",
      },
      { callLLM }
    );
    expect(callLLM.mock.calls[0][0].system).toContain("1e");
  });

  it("returns sanitised error when the LLM upstream call throws", async () => {
    const callLLM = vi
      .fn()
      .mockRejectedValueOnce(new Error("upstream 429 req_id=leak_XYZ"));
    const logger = vi.fn();
    const result = await narrateScene(
      { session: makeSession(), worldStateHash: "abc12345" },
      { callLLM, logger }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Upstream model call failed.");
    }
    expect(logger).toHaveBeenCalledWith("narrate-scene", expect.any(Error));
    expect(JSON.stringify(result)).not.toContain("leak_XYZ");
  });
});
