import { describe, it, expect, vi } from "vitest";
import { resolveInteraction } from "@/lib/orchestration/resolve-interaction";

const optimizedIntent = {
  version: "pf2e",
  rawInput: "I swing at the goblin",
  action: "strike",
  skillOrAttack: "Longsword",
  target: "goblin",
  description: "Strike the goblin with a longsword.",
  actionCost: 1,
};

describe("resolveInteraction", () => {
  it("composes optimizeInput + adjudicate and returns a resolved result", async () => {
    const callClaude = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(optimizedIntent));

    const result = await resolveInteraction(
      {
        rawInput: "I swing at the goblin",
        version: "pf2e",
        overrideModifier: 5,
        overrideDc: 15,
      },
      { callClaude, adjudicateOptions: { seed: 1 } }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.intent.action).toBe("strike");
      expect(result.result.roll.dc).toBe(15);
      expect(result.result.roll.modifiers[0].value).toBe(5);
      expect(result.result.outcome).toBe("resolved");
    }
  });

  it("UI overrides take precedence over optimizer-inferred modifier and dc", async () => {
    // Use schema-valid high values for the inferred fields so we can tell
    // whether they get overridden.
    const optimizedWithInferred = {
      ...optimizedIntent,
      modifier: 35,
      dc: 55,
    };
    const callClaude = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(optimizedWithInferred));

    const result = await resolveInteraction(
      {
        rawInput: "I swing",
        version: "pf2e",
        overrideModifier: 3,
        overrideDc: 12,
      },
      { callClaude, adjudicateOptions: { seed: 1 } }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.roll.dc).toBe(12);
      expect(result.result.roll.modifiers[0].value).toBe(3);
    }
  });

  it("falls back to optimizer-inferred values when no overrides provided", async () => {
    const optimizedWithInferred = {
      ...optimizedIntent,
      modifier: 8,
      dc: 20,
    };
    const callClaude = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(optimizedWithInferred));

    const result = await resolveInteraction(
      { rawInput: "I swing", version: "pf2e" },
      { callClaude, adjudicateOptions: { seed: 1 } }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.roll.dc).toBe(20);
      expect(result.result.roll.modifiers[0].value).toBe(8);
    }
  });

  it("returns stage='optimize' failure when optimizer fails", async () => {
    const callClaude = vi
      .fn()
      .mockRejectedValueOnce(new Error("upstream down"));
    const logger = vi.fn();
    const result = await resolveInteraction(
      { rawInput: "I swing", version: "pf2e" },
      { callClaude, logger }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe("optimize");
    }
  });

  it("routes narrative intents through adjudicate without rolling", async () => {
    const narrativeIntent = {
      version: "pf2e",
      rawInput: "I brood silently by the fire",
      action: "narrative",
      description: "The character broods by the fire without action.",
    };
    const callClaude = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(narrativeIntent));

    const result = await resolveInteraction(
      { rawInput: "I brood silently", version: "pf2e" },
      { callClaude }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.outcome).toBe("narrative");
      expect(result.result.roll.rolls).toHaveLength(0);
    }
  });
});
