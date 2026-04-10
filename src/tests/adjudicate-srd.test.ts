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
    modifier: 5,
    dc: 15,
    ...overrides,
  };
}

describe("adjudicate — srdContext", () => {
  it("when srdContext is provided, it appears in the summary", () => {
    const intent = makeIntent();
    const result = adjudicate(intent, {
      seed: 1,
      srdContext: "[Longsword] Longsword: 1d8 S, reach 5 ft.",
    });
    expect(result.summary).toContain("[Longsword] Longsword");
    expect(result.summary).toContain("Rules Reference:");
  });

  it("when srdContext is not provided, summary is unchanged from baseline", () => {
    const intent = makeIntent();
    const withoutSrd = adjudicate(intent, { seed: 1 });
    const withSrd = adjudicate(intent, {
      seed: 1,
      srdContext: "some rules text",
    });

    // Summary without SRD should NOT contain "Rules Reference"
    expect(withoutSrd.summary).not.toContain("Rules Reference:");
    // Summary with SRD has extra section appended
    expect(withSrd.summary).toContain("Rules Reference:");
    // The base part of the summary should be the same
    expect(withSrd.summary.startsWith(withoutSrd.summary)).toBe(true);
  });

  it("narrative intents are not affected by srdContext", () => {
    const intent = makeIntent({ action: "narrative", dc: undefined, modifier: undefined });
    const result = adjudicate(intent, { seed: 1, srdContext: "some rules text" });
    // Narrative path returns description as summary directly — no rules reference appended
    expect(result.outcome).toBe("narrative");
    expect(result.summary).toBe(intent.description);
    expect(result.summary).not.toContain("Rules Reference:");
  });
});
