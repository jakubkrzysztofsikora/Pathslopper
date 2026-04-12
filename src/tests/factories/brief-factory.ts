import type { SessionBrief } from "@/lib/schemas/session-brief";

/**
 * Creates a valid SessionBrief for use in tests.
 * All fields comply with SessionBriefSchema constraints.
 */
export function makeBrief(overrides: Partial<SessionBrief> = {}): SessionBrief {
  return {
    version: "pf2e",
    partySize: 4,
    partyLevel: 3,
    targetDurationHours: 4,
    tone: "heroic adventure",
    setting: "Ancient ruins on the outskirts of Absalom.",
    presetId: "classic",
    storyDna: {
      version: "pf2e",
      sliders: { narrativePacing: 5, tacticalLethality: 5, npcImprov: 5 },
      tags: { include: [], exclude: [] },
    },
    characterHooks: [],
    safetyTools: { lines: [], veils: [], xCardEnabled: true },
    ...overrides,
  };
}
