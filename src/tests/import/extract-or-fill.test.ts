import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  extendWithSynthesizedPaths,
  EXTRACT_OR_FILL_PREFIX_PL,
  formatImportedSections,
} from "@/lib/orchestration/import/extract-or-fill";
import type { ImportedSections } from "@/lib/orchestration/import/markdown-parser";

function sampleSections(overrides: Partial<ImportedSections> = {}): ImportedSections {
  return {
    frontmatter: { system: "pf2e", party_level: 3, party_size: 4, duration_hours: 4, title: "Test" },
    title: "Test Session",
    lede: "A short session.",
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

describe("extendWithSynthesizedPaths", () => {
  it("adds a synthesizedPaths field to any object schema", () => {
    const Base = z.object({ scenes: z.array(z.string()) });
    const Extended = extendWithSynthesizedPaths(Base);
    const result = Extended.safeParse({
      scenes: ["one"],
      synthesizedPaths: { "scene-1": ["prompt"] },
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-record synthesizedPaths", () => {
    const Base = z.object({ scenes: z.array(z.string()) });
    const Extended = extendWithSynthesizedPaths(Base);
    const result = Extended.safeParse({
      scenes: ["one"],
      synthesizedPaths: "not a record",
    });
    expect(result.success).toBe(false);
  });

  it("allows synthesizedPaths to be empty (fully-extracted output)", () => {
    const Base = z.object({ scenes: z.array(z.string()) });
    const Extended = extendWithSynthesizedPaths(Base);
    const result = Extended.safeParse({ scenes: ["one"], synthesizedPaths: {} });
    expect(result.success).toBe(true);
  });

  it("requires synthesizedPaths to be present (caller must emit empty {} for fully extracted)", () => {
    const Base = z.object({ scenes: z.array(z.string()) });
    const Extended = extendWithSynthesizedPaths(Base);
    const result = Extended.safeParse({ scenes: ["one"] });
    expect(result.success).toBe(false);
  });
});

describe("EXTRACT_OR_FILL_PREFIX_PL", () => {
  it("is a non-empty Polish instruction block", () => {
    expect(EXTRACT_OR_FILL_PREFIX_PL).toMatch(/TRYB IMPORTU/);
    expect(EXTRACT_OR_FILL_PREFIX_PL).toMatch(/synthesizedPaths/);
    expect(EXTRACT_OR_FILL_PREFIX_PL).toMatch(/nazw(y|ach|ami)? własn/i);
  });

  it("mentions the Three-Clue Rule for synthesis of missing clues", () => {
    expect(EXTRACT_OR_FILL_PREFIX_PL).toMatch(/trzech\s+wskaz/i);
  });
});

describe("formatImportedSections", () => {
  it("serialises sections into a readable block for the LLM", () => {
    const out = formatImportedSections(sampleSections());
    expect(out).toMatch(/NOTATKI UŻYTKOWNIKA/);
    expect(out).toMatch(/Rain pours/);
    expect(out).toMatch(/Sister Meren/);
    expect(out).toMatch(/Spectral Monk/);
  });

  it("preserves proper nouns verbatim", () => {
    const out = formatImportedSections(sampleSections());
    expect(out).toContain("Sister Meren");
    expect(out).toContain("The Nave");
  });

  it("marks empty sections explicitly so the LLM knows to synthesise", () => {
    const empty = sampleSections({
      clocks: [],
      fronts: [],
      endings: [],
    });
    const out = formatImportedSections(empty);
    expect(out).toMatch(/ZEGARY[\s\S]*brak/i);
    expect(out).toMatch(/FRONTY[\s\S]*brak/i);
    expect(out).toMatch(/ZAKOŃCZENIA[\s\S]*brak/i);
  });

  it("lists unclassified sections so the LLM can salvage content", () => {
    const withUnclassified = sampleSections({
      unclassified: [{ heading: "World History", body: "Long ago, the abbey fell." }],
    });
    const out = formatImportedSections(withUnclassified);
    expect(out).toMatch(/NIESKLASYFIKOWANE/);
    expect(out).toContain("World History");
  });
});
