import { describe, it, expect } from "vitest";
import { adjudicate } from "@/lib/orchestration/adjudicate";
import type { PlayerIntent } from "@/lib/schemas/player-intent";

function makeIntent(overrides: Partial<PlayerIntent> = {}): PlayerIntent {
  return {
    version: "pf2e",
    rawInput: "I swing at the goblin.",
    action: "strike",
    skillOrAttack: "Longsword",
    target: "goblin",
    description: "Longsword strike against the goblin.",
    ...overrides,
  };
}

describe("adjudicate", () => {
  it("returns a narrative outcome with no roll for pure narration", () => {
    const intent = makeIntent({ action: "narrative", skillOrAttack: undefined });
    const result = adjudicate(intent);
    expect(result.outcome).toBe("narrative");
    expect(result.roll.rolls).toHaveLength(0);
    expect(result.roll.total).toBe(0);
    expect(result.summary).toBe(intent.description);
  });

  it("rolls 1d20 + modifier and returns needs-dc when no DC provided", () => {
    const intent = makeIntent({ modifier: 5 });
    const result = adjudicate(intent, { seed: 1 });
    expect(result.outcome).toBe("needs-dc");
    expect(result.roll.rolls).toHaveLength(1);
    expect(result.roll.modifiers).toEqual([{ label: "Longsword", value: 5 }]);
    expect(result.roll.total).toBe(result.roll.rolls[0] + 5);
  });

  it("runs a check and surfaces degreeOfSuccess when DC is provided", () => {
    const intent = makeIntent({ modifier: 5, dc: 15 });
    const result = adjudicate(intent, { seed: 1 });
    expect(result.outcome).toBe("resolved");
    expect(result.roll.dc).toBe(15);
    expect(result.roll.degreeOfSuccess).toBeDefined();
  });

  it("is reproducible given the same seed", () => {
    const intent = makeIntent({ modifier: 3, dc: 12 });
    const a = adjudicate(intent, { seed: 99 });
    const b = adjudicate(intent, { seed: 99 });
    expect(a.roll.total).toBe(b.roll.total);
    expect(a.roll.degreeOfSuccess).toBe(b.roll.degreeOfSuccess);
  });

  it("uses defaultModifier fallback when intent has none", () => {
    const intent = makeIntent();
    const result = adjudicate(intent, { seed: 1, defaultModifier: 7 });
    expect(result.roll.modifiers).toEqual([{ label: "Longsword", value: 7 }]);
  });

  it("labels the modifier using action kind when skillOrAttack is absent", () => {
    const intent = makeIntent({
      skillOrAttack: undefined,
      action: "skill-check",
      modifier: 4,
    });
    const result = adjudicate(intent, { seed: 1 });
    expect(result.roll.modifiers[0].label).toBe("Skill");
  });

  it("summary includes the target name when present", () => {
    const intent = makeIntent({ modifier: 5, dc: 15 });
    const result = adjudicate(intent, { seed: 1 });
    expect(result.summary).toContain("goblin");
  });

  it("omits the modifier term when modifier is zero", () => {
    const intent = makeIntent({ modifier: 0 });
    const result = adjudicate(intent, { seed: 1 });
    expect(result.roll.modifiers).toEqual([]);
  });
});
