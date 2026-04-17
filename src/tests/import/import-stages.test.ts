import { describe, it, expect } from "vitest";
import { buildImportChain } from "@/lib/orchestration/import/import-stages";
import type { ImportedSections } from "@/lib/orchestration/import/markdown-parser";
import type { SessionBrief } from "@/lib/schemas/session-brief";

function sampleBrief(): SessionBrief {
  return {
    version: "pf2e",
    tone: "mroczny",
    setting: "monastery",
    presetId: "custom",
    targetDurationHours: 4,
    partySize: 4,
    partyLevel: 3,
    characterHooks: [],
    storyDna: {} as SessionBrief["storyDna"],
    safetyTools: { lines: [], veils: [], xCardEnabled: false },
  };
}

function sampleSections(overrides: Partial<ImportedSections> = {}): ImportedSections {
  return {
    frontmatter: { system: "pf2e" },
    title: "Shattered Sanctum",
    lede: "A crumbling monastery.",
    strongStart: "Rain pours through the broken roof.",
    scenes: [{ name: "The Nave", body: "Confront spectral monks." }],
    secrets: ["The diary is in cipher."],
    locations: [{ name: "The Nave", body: "Pews and a bell." }],
    npcs: [{ name: "Sister Meren", body: "Weeping novice." }],
    monsters: [{ name: "Spectral Monk", body: "Level 3 undead." }],
    treasure: ["Silver thurible"],
    clocks: [],
    fronts: [],
    endings: [],
    unclassified: [],
    ...overrides,
  };
}

describe("buildImportChain", () => {
  const brief = sampleBrief();
  const sections = sampleSections();
  const chain = buildImportChain();

  it("exposes all six stages", () => {
    expect(chain.stageA).toBeDefined();
    expect(chain.stageB).toBeDefined();
    expect(chain.stageC).toBeDefined();
    expect(chain.stageD).toBeDefined();
    expect(chain.stageE).toBeDefined();
    expect(chain.stageF).toBeDefined();
  });

  it("wraps stage A prompts with extract-or-fill prefix + user notes", () => {
    const { system, user } = chain.stageA.buildPrompt({ brief, sections });
    expect(system).toMatch(/TRYB IMPORTU/);
    expect(user).toMatch(/NOTATKI UŻYTKOWNIKA/);
    expect(user).toContain("Sister Meren");
  });

  it("stage A response schema requires synthesizedPaths", () => {
    // Missing synthesizedPaths → fail
    const bad = chain.stageA.schema.safeParse({
      acts: [{ title: "A", stakes: "s" }],
      fronts: [
        {
          name: "F",
          dangers: [{ name: "D", impulse: "I" }],
          grimPortents: ["a", "b", "c"],
          impendingDoom: "doom",
          stakes: ["Q?"],
        },
      ],
      primaryConflict: "P",
    });
    expect(bad.success).toBe(false);
  });

  it("stage A response schema accepts synthesizedPaths={} for fully extracted", () => {
    const good = chain.stageA.schema.safeParse({
      acts: [{ title: "A", stakes: "s" }],
      fronts: [
        {
          name: "F",
          dangers: [{ name: "D", impulse: "I" }],
          grimPortents: ["a", "b", "c"],
          impendingDoom: "doom",
          stakes: ["Q?"],
        },
      ],
      primaryConflict: "P",
      synthesizedPaths: {},
    });
    expect(good.success).toBe(true);
  });

  it("stage C prompt mentions Three-Clue synthesis obligation when secrets < 3 per tag", () => {
    // Only 1 secret supplied — stage C should be instructed to add 2 more
    const { system } = chain.stageC.buildPrompt({
      brief,
      sections,
      skeleton: { acts: [], fronts: [], primaryConflict: "" },
      scenes: { scenes: [] },
    });
    expect(system).toMatch(/trzech\s+wskaz/i);
  });

  it("stage F prompt mandates stat-block synthesis regardless of user content", () => {
    const { system } = chain.stageF.buildPrompt({
      brief,
      sections,
      graph: {
        id: "g1",
        version: "pf2e",
        brief,
        startNodeId: "n0",
        nodes: [],
        edges: [],
        clocks: [],
        fronts: [],
        secrets: [],
        npcs: [],
        locations: [],
        endings: [],
      },
      partyLevel: brief.partyLevel,
    });
    expect(system).toMatch(/STAT BLOKI/);
    expect(system).toMatch(/synthesizedPaths/);
  });

  it("each stage propagates frontmatter hints (party level etc.) into the user prompt", () => {
    const sectionsWithHints = sampleSections({
      frontmatter: { system: "pf2e", party_level: 5, party_size: 4, duration_hours: 3 },
    });
    const { user } = chain.stageA.buildPrompt({ brief, sections: sectionsWithHints });
    // User's explicit party_level should surface somewhere for the LLM to align
    expect(user).toMatch(/party_level|partyLevel|poziom/i);
  });
});
