import { describe, it, expect } from "vitest";
import {
  StoryDNASchema,
  VERSION_SLIDER_DEFAULTS,
} from "@/lib/schemas/story-dna";
import { TacticalZoneSchema } from "@/lib/schemas/zone";
import { CharacterSheetParsedSchema } from "@/lib/schemas/character-sheet";

describe("StoryDNASchema", () => {
  it("parses valid PF2e story DNA", () => {
    const input = {
      version: "pf2e",
      sliders: {
        narrativePacing: 50,
        tacticalLethality: 55,
        npcImprov: 50,
      },
      tags: {
        include: ["Dark Fantasy"],
        exclude: ["delve"],
      },
    };
    const result = StoryDNASchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe("pf2e");
      expect(result.data.sliders.narrativePacing).toBe(50);
    }
  });

  it("parses valid PF1e story DNA with default values", () => {
    const input = {
      version: "pf1e",
      sliders: VERSION_SLIDER_DEFAULTS.pf1e,
      tags: { include: [], exclude: [] },
    };
    const result = StoryDNASchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sliders.narrativePacing).toBe(60);
      expect(result.data.sliders.tacticalLethality).toBe(40);
      expect(result.data.sliders.npcImprov).toBe(70);
    }
  });

  it("rejects slider values out of range", () => {
    const input = {
      version: "pf2e",
      sliders: {
        narrativePacing: 150,
        tacticalLethality: 55,
        npcImprov: 50,
      },
      tags: { include: [], exclude: [] },
    };
    const result = StoryDNASchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects negative slider values", () => {
    const input = {
      version: "pf1e",
      sliders: {
        narrativePacing: -1,
        tacticalLethality: 40,
        npcImprov: 70,
      },
      tags: { include: [], exclude: [] },
    };
    const result = StoryDNASchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects unknown version", () => {
    const input = {
      version: "pf3e",
      sliders: { narrativePacing: 50, tacticalLethality: 50, npcImprov: 50 },
      tags: { include: [], exclude: [] },
    };
    const result = StoryDNASchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("round-trips through parse", () => {
    const input = {
      version: "pf1e" as const,
      sliders: VERSION_SLIDER_DEFAULTS.pf1e,
      tags: { include: ["Horror"], exclude: ["delve"] },
    };
    const first = StoryDNASchema.parse(input);
    const second = StoryDNASchema.parse(first);
    expect(second).toEqual(first);
  });
});

describe("TacticalZoneSchema", () => {
  const validZone = {
    id: "zone-01",
    name: "Damp Cellar",
    terrain: "underground",
    cover: [
      {
        id: "barrel-01",
        name: "Overturned Barrel",
        coverBonus: 2,
        description: "A rotting barrel that provides partial cover.",
      },
    ],
    elevation: -5,
    hazards: ["standing water", "slippery floor"],
    lighting: "dim",
    pf2eActionCost: 1,
  };

  it("parses a valid tactical zone", () => {
    const result = TacticalZoneSchema.safeParse(validZone);
    expect(result.success).toBe(true);
  });

  it("parses zone without optional fields", () => {
    const { pf2eActionCost, ...withoutOptional } = validZone;
    const result = TacticalZoneSchema.safeParse(withoutOptional);
    expect(result.success).toBe(true);
  });

  it("parses zone with pf1eMovementCost", () => {
    const zone = { ...validZone, pf1eMovementCost: 10 };
    const result = TacticalZoneSchema.safeParse(zone);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pf1eMovementCost).toBe(10);
    }
  });

  it("rejects invalid terrain type", () => {
    const invalid = { ...validZone, terrain: "void" };
    const result = TacticalZoneSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects invalid lighting condition", () => {
    const invalid = { ...validZone, lighting: "pitch-black" };
    const result = TacticalZoneSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects missing required id field", () => {
    const { id, ...withoutId } = validZone;
    const result = TacticalZoneSchema.safeParse(withoutId);
    expect(result.success).toBe(false);
  });
});

describe("CharacterSheetParsedSchema discriminated union", () => {
  it("parses a valid PF1e character sheet", () => {
    const pf1eSheet = {
      version: "pf1e",
      name: "Aldric Stonehammer",
      race: "Dwarf",
      classes: ["Fighter"],
      level: 5,
      feats: ["Power Attack", "Cleave"],
      bab: 5,
      saves: { fortitude: 7, reflex: 2, will: 2 },
      abilityScores: { str: 18, dex: 12, con: 16, int: 10, wis: 10, cha: 8 },
    };
    const result = CharacterSheetParsedSchema.safeParse(pf1eSheet);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe("pf1e");
      if (result.data.version === "pf1e") {
        expect(result.data.feats).toContain("Power Attack");
        expect(result.data.bab).toBe(5);
      }
    }
  });

  it("parses a valid PF2e character sheet", () => {
    const pf2eSheet = {
      version: "pf2e",
      name: "Sylara",
      ancestry: "Elf",
      background: "Scholar",
      class: "Wizard",
      level: 3,
      actionTags: ["Arcane Cascade"],
      proficiencies: {
        perception: "trained",
        fortitude: "expert",
        reflex: "trained",
        will: "master",
      },
      abilityScores: { str: 8, dex: 14, con: 12, int: 18, wis: 14, cha: 10 },
    };
    const result = CharacterSheetParsedSchema.safeParse(pf2eSheet);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe("pf2e");
      if (result.data.version === "pf2e") {
        expect(result.data.ancestry).toBe("Elf");
        expect(result.data.proficiencies["will"]).toBe("master");
      }
    }
  });

  it("rejects a PF1e sheet missing feats field", () => {
    const invalid = {
      version: "pf1e",
      name: "Broken",
      race: "Human",
      classes: ["Rogue"],
      level: 1,
      bab: 0,
      saves: { fortitude: 0, reflex: 2, will: 0 },
      abilityScores: { str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 10 },
    };
    const result = CharacterSheetParsedSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects a PF2e sheet with invalid proficiency rank", () => {
    const invalid = {
      version: "pf2e",
      name: "Broken",
      ancestry: "Human",
      background: "Farmer",
      class: "Fighter",
      level: 1,
      actionTags: [],
      proficiencies: { fortitude: "godlike" },
      abilityScores: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 },
    };
    const result = CharacterSheetParsedSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
