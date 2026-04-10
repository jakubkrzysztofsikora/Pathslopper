import { describe, it, expect } from "vitest";
import { adjudicate } from "@/lib/orchestration/adjudicate";
import type { PlayerIntent } from "@/lib/schemas/player-intent";
import type { CharacterSheetParsed } from "@/lib/schemas/character-sheet";

function makeStrikeIntent(overrides: Partial<PlayerIntent> = {}): PlayerIntent {
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

function makeSkillIntent(skill: string): PlayerIntent {
  return {
    version: "pf2e",
    rawInput: `I use ${skill}`,
    action: "skill-check",
    skillOrAttack: skill,
    description: `${skill} check.`,
  };
}

function makePF2eCharacter(): CharacterSheetParsed {
  return {
    version: "pf2e",
    name: "Aldric",
    ancestry: "Human",
    background: "Scholar",
    class: "Wizard",
    level: 5,
    actionTags: [],
    proficiencies: {
      Athletics: "trained",   // trained = level + 2 = 7
      Arcana: "expert",       // expert = level + 4 = 9
    },
    abilityScores: {
      str: 10, // str mod = 0
      dex: 14, // dex mod = +2
      con: 12,
      int: 18, // int mod = +4
      wis: 14,
      cha: 10,
    },
  };
}

function makePF1eCharacter(): CharacterSheetParsed {
  return {
    version: "pf1e",
    name: "Brennan",
    race: "Half-Orc",
    classes: ["Fighter"],
    level: 4,
    feats: [],
    bab: 4,
    saves: {
      fortitude: 5,
      reflex: 1,
      will: 1,
    },
    abilityScores: {
      str: 18, // str mod = +4
      dex: 14, // dex mod = +2
      con: 14,
      int: 10,
      wis: 10,
      cha: 8,
    },
  };
}

describe("adjudicate — character-derived modifier", () => {
  it("PF2e trained Athletics: auto-populates modifier when intent has none", () => {
    const intent = makeSkillIntent("Athletics");
    const character = makePF2eCharacter();
    // trained at level 5 = 5 + 2 = 7, str mod = 0, total = 7
    const result = adjudicate(intent, { seed: 1, character });
    expect(result.roll.modifiers.length).toBeGreaterThan(0);
    expect(result.roll.modifiers[0].value).toBe(7);
  });

  it("PF2e expert Arcana: auto-populates modifier using int modifier", () => {
    const intent = makeSkillIntent("Arcana");
    const character = makePF2eCharacter();
    // expert at level 5 = 5 + 4 = 9, int mod = +4, total = 13
    const result = adjudicate(intent, { seed: 1, character });
    expect(result.roll.modifiers[0].value).toBe(13);
  });

  it("explicit modifier in intent overrides character-derived modifier", () => {
    const intent = makeStrikeIntent({ modifier: 99 });
    const character = makePF2eCharacter();
    const result = adjudicate(intent, { seed: 1, character });
    expect(result.roll.modifiers[0].value).toBe(99);
  });

  it("no character falls back to 0 when no modifier and no default", () => {
    const intent = makeStrikeIntent();
    const result = adjudicate(intent, { seed: 1 });
    expect(result.roll.modifiers).toEqual([]);
  });

  it("defaultModifier takes priority over character-derived modifier when no intent modifier", () => {
    const intent = makeSkillIntent("Athletics");
    const character = makePF2eCharacter();
    const result = adjudicate(intent, { seed: 1, character, defaultModifier: 3 });
    // defaultModifier wins over character-derived
    expect(result.roll.modifiers[0].value).toBe(3);
  });

  it("PF1e strike uses BAB + STR mod", () => {
    const intent = makeStrikeIntent({ version: "pf1e" });
    const character = makePF1eCharacter();
    // bab=4, str mod = +4, total = 8
    const result = adjudicate(intent, { seed: 1, character });
    expect(result.roll.modifiers[0].value).toBe(8);
  });

  it("PF1e save uses relevant save bonus", () => {
    const intent: PlayerIntent = {
      version: "pf1e",
      rawInput: "I save vs fireball",
      action: "save",
      skillOrAttack: "reflex",
      description: "Reflex save",
    };
    const character = makePF1eCharacter();
    // reflex = 1
    const result = adjudicate(intent, { seed: 1, character });
    expect(result.roll.modifiers[0].value).toBe(1);
  });
});
