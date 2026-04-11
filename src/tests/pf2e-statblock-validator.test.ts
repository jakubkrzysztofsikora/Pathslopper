import { describe, it, expect } from "vitest";
import {
  validatePf2eStatBlock,
} from "@/lib/orchestration/director/pf2e-statblock-validator";
import type { Pf2eStatBlock } from "@/lib/schemas/session-graph";

// Level-3 canonical values from pf2e-creature-build-table.json (post
// 2026-04-11 rewrite against Archives of Nethys Table 2-5):
//   AC moderate=18, HP moderate=45, strikeBonus moderate=10,
//   strikeDamage moderate `1d8+6` average=10, perception moderate=9,
//   savingThrow moderate=9
const CANONICAL_LEVEL_3: Pf2eStatBlock = {
  tier: "pf2e",
  level: 3,
  ac: 18,
  hp: 45,
  perception: 9,
  saves: { fort: 9, ref: 9, will: 9 },
  strikes: [
    { name: "Łapa", toHit: 10, damage: "1d8+6", traits: ["agile"] },
  ],
  resistances: [],
  weaknesses: [],
  immunities: [],
  specialAbilities: [],
  reactions: [],
};

describe("validatePf2eStatBlock", () => {
  it("accepts a canonical level-3 stat block unchanged", () => {
    const { clamped, warnings } = validatePf2eStatBlock(CANONICAL_LEVEL_3);
    expect(warnings).toHaveLength(0);
    expect(clamped.ac).toBe(18);
    expect(clamped.hp).toBe(45);
    expect(clamped.strikes[0].toHit).toBe(10);
  });

  it("clamps AC 24 at level 3 to AC 20 (moderate 18 + 2)", () => {
    const block: Pf2eStatBlock = { ...CANONICAL_LEVEL_3, ac: 24 };
    const { clamped, warnings } = validatePf2eStatBlock(block);
    const acWarning = warnings.find((w) => w.field === "ac");
    expect(acWarning).toBeDefined();
    expect(clamped.ac).toBe(20);
    expect(acWarning!.actual).toBe(24);
    expect(acWarning!.clampedTo).toBe(20);
  });

  it("clamps HP 90 at level 3 to the high boundary ~52", () => {
    // moderate=45, high boundary = round(45 * 1.15) = 52
    const block: Pf2eStatBlock = { ...CANONICAL_LEVEL_3, hp: 90 };
    const { clamped, warnings } = validatePf2eStatBlock(block);
    const hpWarning = warnings.find((w) => w.field === "hp");
    expect(hpWarning).toBeDefined();
    expect(clamped.hp).toBe(Math.round(45 * 1.15)); // 52
    expect(hpWarning!.actual).toBe(90);
  });

  it("clamps strike to-hit +20 at level 3 to the moderate+2 ceiling of 12", () => {
    // strikeBonus moderate=10, ceiling=12
    const block: Pf2eStatBlock = {
      ...CANONICAL_LEVEL_3,
      strikes: [{ name: "Łapa", toHit: 20, damage: "1d8+6", traits: [] }],
    };
    const { clamped, warnings } = validatePf2eStatBlock(block);
    const hitWarning = warnings.find((w) => w.field === "strikes[0].toHit");
    expect(hitWarning).toBeDefined();
    expect(clamped.strikes[0].toHit).toBe(12);
  });

  it("clamps strike damage average from 32 to the legal band max (moderate avg 10, max=13)", () => {
    // strikeDamage moderate average=10, max=13. "4d8+14" avg = 18+14=32
    const block: Pf2eStatBlock = {
      ...CANONICAL_LEVEL_3,
      strikes: [{ name: "Cios", toHit: 10, damage: "4d8+14", traits: [] }],
    };
    const { clamped, warnings } = validatePf2eStatBlock(block);
    const dmgWarning = warnings.find((w) => w.field === "strikes[0].damage");
    expect(dmgWarning).toBeDefined();
    expect(dmgWarning!.actual).toBeGreaterThan(13);
    // clamped average should be at most 13
    const dmgMatch = clamped.strikes[0].damage.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
    if (dmgMatch) {
      const diceAvg = parseInt(dmgMatch[1]) * ((parseInt(dmgMatch[2]) + 1) / 2);
      const flat = dmgMatch[3] ? parseInt(dmgMatch[3]) : 0;
      expect(diceAvg + flat).toBeLessThanOrEqual(13);
    }
  });

  // Amendment Q: save asymmetry tests
  // Level-3 save band: [low-1, extreme+1] = [6-1, 14+1] = [5, 15]
  it("passes asymmetric saves on a level-3 dragon-like creature", () => {
    // fort=12 (high), ref=6 (low), will=12 (high) — all within [5, 15]
    const block: Pf2eStatBlock = {
      ...CANONICAL_LEVEL_3,
      saves: { fort: 12, ref: 6, will: 12 },
    };
    const { clamped, warnings } = validatePf2eStatBlock(block);
    const saveWarnings = warnings.filter((w) => w.field.startsWith("saves."));
    expect(saveWarnings).toHaveLength(0);
    expect(clamped.saves.fort).toBe(12);
    expect(clamped.saves.ref).toBe(6);
    expect(clamped.saves.will).toBe(12);
  });

  it("clamps over-range save to the level band", () => {
    // Level-3 extreme=14, band max = extreme+1 = 15. ref=25 > 15, clamps to 15.
    const block: Pf2eStatBlock = {
      ...CANONICAL_LEVEL_3,
      saves: { fort: 9, ref: 25, will: 9 },
    };
    const { clamped, warnings } = validatePf2eStatBlock(block);
    const refWarning = warnings.find((w) => w.field === "saves.ref");
    expect(refWarning).toBeDefined();
    expect(refWarning!.actual).toBe(25);
    expect(clamped.saves.ref).toBe(15); // extreme + 1 = 14 + 1 = 15
    // fort and will should be unchanged (9 is within [5, 15])
    expect(warnings.filter((w) => w.field === "saves.fort" || w.field === "saves.will")).toHaveLength(0);
  });

  // Amendment Q: spell DC and spell attack clamp tests
  // Level-3 spellDC: moderate=17, extreme=23. Band: [15, 25].
  it("clamps spell DC 30 at level 3 to the extreme+2 ceiling", () => {
    const block: Pf2eStatBlock = {
      ...CANONICAL_LEVEL_3,
      spellSlots: {
        "1": { slots: 3, dc: 30, attack: 9, list: ["Magic Missile"] },
      },
    };
    const { clamped, warnings } = validatePf2eStatBlock(block);
    const dcWarning = warnings.find((w) => w.field === "spellSlots[1].dc");
    expect(dcWarning).toBeDefined();
    expect(dcWarning!.actual).toBe(30);
    expect(clamped.spellSlots!["1"].dc).toBe(25); // extreme + 2 = 23 + 2 = 25
  });

  it("passes a level-5 caster NPC with legal spell DCs", () => {
    // Level-5 spellDC: moderate=19, extreme=26. Band: [17, 28].
    // Level-5 spellAttack: moderate=11, extreme=18. Band: [9, 20].
    // A high-tier caster might use dc=22 (high) and attack=14 (high) — both in band.
    const block: Pf2eStatBlock = {
      tier: "pf2e",
      level: 5,
      ac: 21,
      hp: 75,
      perception: 12,
      saves: { fort: 12, ref: 9, will: 15 },
      strikes: [{ name: "Magiczny dotyk", toHit: 13, damage: "2d6+6", traits: [] }],
      resistances: [],
      weaknesses: [],
      immunities: [],
      specialAbilities: [],
      reactions: [],
      spellSlots: {
        "1": { slots: 3, dc: 22, attack: 14, list: ["Fireball"] },
        "2": { slots: 2, dc: 22, attack: 14, list: ["Haste"] },
      },
    };
    const { warnings } = validatePf2eStatBlock(block);
    const spellWarnings = warnings.filter((w) => w.field.startsWith("spellSlots"));
    expect(spellWarnings).toHaveLength(0);
  });

  it("throws for level -2 (outside the table)", () => {
    const block: Pf2eStatBlock = { ...CANONICAL_LEVEL_3, level: -2 };
    expect(() => validatePf2eStatBlock(block)).toThrowError(/outside the build table/);
  });

  it("passes level 24 (top of table) without throwing", () => {
    // Canonical level-24 moderate values from AoN Table 2-5:
    //   AC=50, HP=500, strikeBonus=42, damage `4d10+22` avg=44, perc=38, save=38
    const block: Pf2eStatBlock = {
      tier: "pf2e",
      level: 24,
      ac: 50,
      hp: 500,
      perception: 38,
      saves: { fort: 38, ref: 38, will: 38 },
      strikes: [
        { name: "Pazur", toHit: 42, damage: "4d10+22", traits: [] },
      ],
      resistances: [],
      weaknesses: [],
      immunities: [],
      specialAbilities: [],
      reactions: [],
    };
    const { warnings } = validatePf2eStatBlock(block);
    expect(warnings).toHaveLength(0);
  });
});
