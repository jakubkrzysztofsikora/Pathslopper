import { describe, it, expect, vi } from "vitest";
import { optimizeInput } from "@/lib/orchestration/optimize-input";

const validIntent = {
  version: "pf2e",
  rawInput: "I swing my longsword at the goblin",
  action: "strike",
  skillOrAttack: "Longsword",
  target: "goblin",
  description: "Strike the goblin with a longsword.",
  actionCost: 1,
};

describe("optimizeInput orchestrator", () => {
  it("parses a bare JSON response from Claude into a PlayerIntent", async () => {
    const callClaude = vi.fn().mockResolvedValueOnce(JSON.stringify(validIntent));
    const result = await optimizeInput(
      "I swing my longsword at the goblin",
      "pf2e",
      { callClaude }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intent.action).toBe("strike");
      expect(result.intent.target).toBe("goblin");
      expect(result.intent.version).toBe("pf2e");
    }
  });

  it("parses a fenced JSON response from Claude into a PlayerIntent", async () => {
    const callClaude = vi
      .fn()
      .mockResolvedValueOnce("```json\n" + JSON.stringify(validIntent) + "\n```");
    const result = await optimizeInput(
      "I swing my longsword at the goblin",
      "pf2e",
      { callClaude }
    );
    expect(result.ok).toBe(true);
  });

  it("returns error when Claude throws", async () => {
    const callClaude = vi.fn().mockRejectedValueOnce(new Error("upstream 500 req_id=xyz"));
    const logger = vi.fn();
    const result = await optimizeInput("any input", "pf2e", { callClaude, logger });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Upstream model call failed.");
    }
    expect(logger).toHaveBeenCalledWith("optimize-input", expect.any(Error));
    // Ensure upstream error details are not leaked.
    expect(JSON.stringify(result)).not.toContain("req_id=xyz");
  });

  it("returns error when response is not valid JSON", async () => {
    const callClaude = vi.fn().mockResolvedValueOnce("not json at all");
    const result = await optimizeInput("any input", "pf2e", { callClaude });
    expect(result.ok).toBe(false);
  });

  it("returns error when response is valid JSON but fails schema", async () => {
    const callClaude = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ version: "pf2e", action: "strike" }));
    const result = await optimizeInput("any input", "pf2e", { callClaude });
    expect(result.ok).toBe(false);
  });

  it("passes version into the system prompt for PF1e and PF2e", async () => {
    const callClaude = vi.fn().mockResolvedValueOnce(JSON.stringify(validIntent));
    await optimizeInput("any input", "pf2e", { callClaude });
    expect(callClaude.mock.calls[0][0].system).toContain("three-action economy");

    const callClaude2 = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({ ...validIntent, version: "pf1e", actionCost: undefined })
      );
    await optimizeInput("any input", "pf1e", { callClaude: callClaude2 });
    expect(callClaude2.mock.calls[0][0].system).toContain("Pathfinder 1e");
  });
});
