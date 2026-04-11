import { describe, it, expect, vi } from "vitest";
import {
  normalizeLlmIntent,
  optimizeInput,
} from "@/lib/orchestration/optimize-input";

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
    const callLLM = vi.fn().mockResolvedValueOnce(JSON.stringify(validIntent));
    const result = await optimizeInput(
      "I swing my longsword at the goblin",
      "pf2e",
      { callLLM }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intent.action).toBe("strike");
      expect(result.intent.target).toBe("goblin");
      expect(result.intent.version).toBe("pf2e");
    }
  });

  it("parses a fenced JSON response from Claude into a PlayerIntent", async () => {
    const callLLM = vi
      .fn()
      .mockResolvedValueOnce("```json\n" + JSON.stringify(validIntent) + "\n```");
    const result = await optimizeInput(
      "I swing my longsword at the goblin",
      "pf2e",
      { callLLM }
    );
    expect(result.ok).toBe(true);
  });

  it("returns error when Claude throws", async () => {
    const callLLM = vi.fn().mockRejectedValueOnce(new Error("upstream 500 req_id=xyz"));
    const logger = vi.fn();
    const result = await optimizeInput("any input", "pf2e", { callLLM, logger });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Upstream model call failed.");
    }
    expect(logger).toHaveBeenCalledWith("optimize-input", expect.any(Error));
    // Ensure upstream error details are not leaked.
    expect(JSON.stringify(result)).not.toContain("req_id=xyz");
  });

  it("returns error when response is not valid JSON", async () => {
    const callLLM = vi.fn().mockResolvedValueOnce("not json at all");
    const result = await optimizeInput("any input", "pf2e", { callLLM });
    expect(result.ok).toBe(false);
  });

  it("returns error when response is valid JSON but fails schema", async () => {
    const callLLM = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ version: "pf2e", action: "strike" }));
    const result = await optimizeInput("any input", "pf2e", { callLLM });
    expect(result.ok).toBe(false);
  });

  it("passes version into the system prompt for PF1e and PF2e", async () => {
    const callLLM = vi.fn().mockResolvedValueOnce(JSON.stringify(validIntent));
    await optimizeInput("any input", "pf2e", { callLLM });
    expect(callLLM.mock.calls[0][0].system).toContain("three-action economy");

    const callLLM2 = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({ ...validIntent, version: "pf1e", actionCost: undefined })
      );
    await optimizeInput("any input", "pf1e", { callLLM: callLLM2 });
    expect(callLLM2.mock.calls[0][0].system).toContain("Pathfinder 1e");
  });

  // Regression guard for the e2e "narrate scene works after resolve" failure.
  // Real Scaleway llama-3.1-70b-instruct emits `null` and `""` for optional
  // fields even when the prompt says "omit if not applicable". The optimizer
  // must normalize those before schema validation or the whole request fails
  // on a technicality.
  it("normalizes null modifier/dc/actionCost from the LLM response", async () => {
    const llamaShape = {
      version: "pf2e",
      rawInput: "I search for traps",
      action: "skill-check",
      skillOrAttack: "Perception",
      target: "traps",
      description: "The player searches for traps using Perception",
      modifier: null,
      dc: null,
      actionCost: null,
    };
    const callLLM = vi.fn().mockResolvedValueOnce(JSON.stringify(llamaShape));
    const result = await optimizeInput("I search for traps", "pf2e", { callLLM });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intent.action).toBe("skill-check");
      expect(result.intent.modifier).toBeUndefined();
      expect(result.intent.dc).toBeUndefined();
      expect(result.intent.actionCost).toBeUndefined();
    }
  });

  it("normalizes empty-string target/skillOrAttack from the LLM response", async () => {
    const llamaShape = {
      version: "pf2e",
      rawInput: "I look around carefully",
      action: "skill-check",
      skillOrAttack: "",
      target: "",
      description: "Look around the area",
      actionCost: 1,
    };
    const callLLM = vi.fn().mockResolvedValueOnce(JSON.stringify(llamaShape));
    const result = await optimizeInput("I look around carefully", "pf2e", { callLLM });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intent.target).toBeUndefined();
      expect(result.intent.skillOrAttack).toBeUndefined();
    }
  });

  it("normalizes empty-string modifier/dc from the LLM response", async () => {
    // Some models emit "" for uncertain numeric fields rather than null.
    // The unified normalizer must handle both shapes on numeric optionals.
    const llamaShape = {
      version: "pf2e",
      rawInput: "I attempt the leap",
      action: "skill-check",
      skillOrAttack: "Athletics",
      target: "the chasm",
      description: "Leap across the chasm",
      modifier: "",
      dc: "",
      actionCost: 1,
    };
    const callLLM = vi.fn().mockResolvedValueOnce(JSON.stringify(llamaShape));
    const result = await optimizeInput("I attempt the leap", "pf2e", { callLLM });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intent.modifier).toBeUndefined();
      expect(result.intent.dc).toBeUndefined();
    }
  });

  it("normalizes the exact Scaleway llama-3.1-70b 'search for traps' response", async () => {
    // Captured verbatim from prod on 2026-04-11 by curl'ing
    // /api/interaction/resolve with {rawInput: "I search for traps"}.
    // Before the fix this response caused a 502 "Schema validation error".
    const realResponse = {
      version: "pf2e",
      rawInput: "I search for traps",
      action: "skill-check",
      skillOrAttack: "Perception",
      target: "",
      description: "The player searches for traps using Perception",
      modifier: null,
      dc: null,
      actionCost: 1,
    };
    const callLLM = vi.fn().mockResolvedValueOnce(JSON.stringify(realResponse));
    const result = await optimizeInput("I search for traps", "pf2e", { callLLM });
    expect(result.ok).toBe(true);
  });
});

describe("normalizeLlmIntent", () => {
  it("drops null optional numeric fields", () => {
    const input = {
      version: "pf2e",
      rawInput: "x",
      action: "strike",
      description: "y",
      modifier: null,
      dc: null,
      actionCost: null,
    };
    const out = normalizeLlmIntent(input) as Record<string, unknown>;
    expect("modifier" in out).toBe(false);
    expect("dc" in out).toBe(false);
    expect("actionCost" in out).toBe(false);
  });

  it("drops null and empty-string optional short fields", () => {
    const input = {
      version: "pf2e",
      rawInput: "x",
      action: "strike",
      description: "y",
      target: "",
      skillOrAttack: null,
    };
    const out = normalizeLlmIntent(input) as Record<string, unknown>;
    expect("target" in out).toBe(false);
    expect("skillOrAttack" in out).toBe(false);
  });

  it("drops empty-string and whitespace-only optional numeric fields", () => {
    // Some LLMs emit "" for uncertain numbers rather than null. The
    // unified normalizer must drop these so Zod's .optional() kicks in.
    const input = {
      version: "pf2e",
      rawInput: "x",
      action: "strike",
      description: "y",
      modifier: "",
      dc: "   ",
      actionCost: "",
    };
    const out = normalizeLlmIntent(input) as Record<string, unknown>;
    expect("modifier" in out).toBe(false);
    expect("dc" in out).toBe(false);
    expect("actionCost" in out).toBe(false);
  });

  it("drops whitespace-only optional short fields", () => {
    const input = {
      version: "pf2e",
      rawInput: "x",
      action: "strike",
      description: "y",
      target: "   ",
      skillOrAttack: "\t\n",
    };
    const out = normalizeLlmIntent(input) as Record<string, unknown>;
    expect("target" in out).toBe(false);
    expect("skillOrAttack" in out).toBe(false);
  });

  it("preserves real values on optional fields", () => {
    const input = {
      version: "pf2e",
      rawInput: "x",
      action: "strike",
      description: "y",
      modifier: 5,
      dc: 15,
      target: "goblin",
      skillOrAttack: "Longsword",
    };
    const out = normalizeLlmIntent(input) as Record<string, unknown>;
    expect(out.modifier).toBe(5);
    expect(out.dc).toBe(15);
    expect(out.target).toBe("goblin");
    expect(out.skillOrAttack).toBe("Longsword");
  });

  it("is a no-op on non-object input", () => {
    expect(normalizeLlmIntent(null)).toBe(null);
    expect(normalizeLlmIntent("string")).toBe("string");
    expect(normalizeLlmIntent(42)).toBe(42);
    expect(normalizeLlmIntent([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("does not mutate the input object", () => {
    const input = { version: "pf2e", modifier: null, target: "" };
    const frozen = Object.freeze({ ...input });
    expect(() => normalizeLlmIntent(frozen)).not.toThrow();
  });
});
