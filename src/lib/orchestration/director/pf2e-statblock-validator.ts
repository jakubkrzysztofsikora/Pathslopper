import type { Pf2eStatBlock, Pf2eStrike } from "@/lib/schemas/session-graph";
import buildTable from "./pf2e-creature-build-table.json";

interface CreatureBuildRow {
  level: number;
  ac: { low: number; moderate: number; high: number; extreme: number };
  hp: { low: number; moderate: number; high: number };
  strikeBonus: { low: number; moderate: number; high: number; extreme: number };
  strikeDamage: { expression: string; average: number };
  savingThrow: { terrible: number; low: number; moderate: number; high: number; extreme: number };
  perception: { terrible: number; low: number; moderate: number; high: number; extreme: number };
  spellDC: { moderate: number; high: number; extreme: number };
  spellAttack: { moderate: number; high: number; extreme: number };
  skills: { low: number; moderate: number; high: number; extreme: number };
}

const TABLE: CreatureBuildRow[] = (buildTable as { levels: CreatureBuildRow[] }).levels;
const TABLE_MAP = new Map<number, CreatureBuildRow>(TABLE.map((row) => [row.level, row]));

export interface StatBlockValidationWarning {
  field: string;
  level: number;
  expected: { min: number; max: number; moderate: number };
  actual: number;
  clampedTo: number;
}

export interface StatBlockValidationResult {
  clamped: Pf2eStatBlock;
  warnings: StatBlockValidationWarning[];
}

function clampField(
  value: number,
  min: number,
  max: number,
  moderate: number,
  field: string,
  level: number,
  warnings: StatBlockValidationWarning[]
): number {
  if (value < min || value > max) {
    const clampedTo = Math.max(min, Math.min(max, value));
    warnings.push({ field, level, expected: { min, max, moderate }, actual: value, clampedTo });
    return clampedTo;
  }
  return value;
}

/**
 * Parse a simple damage expression like "2d8+5" or "1d6-1" and return the
 * average value. Only the "NdM±K" form is supported (no multiplication,
 * no nested expressions). Returns null if the expression is not parseable.
 */
function parseDamageAverage(expression: string): { average: number; diceAvg: number; flat: number } | null {
  const match = expression.trim().match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!match) return null;
  const numDice = parseInt(match[1], 10);
  const dieSides = parseInt(match[2], 10);
  const flat = match[3] ? parseInt(match[3], 10) : 0;
  const diceAvg = numDice * ((dieSides + 1) / 2);
  return { average: diceAvg + flat, diceAvg, flat };
}

/**
 * Clamp the flat bonus of a damage expression so that its average falls within
 * [min, max]. Returns the clamped expression string.
 */
function clampDamageExpression(
  expression: string,
  targetFlatBonus: number
): string {
  const match = expression.trim().match(/^(\d+d\d+)([+-]\d+)?$/i);
  if (!match) return expression;
  const diceStr = match[1];
  if (targetFlatBonus === 0) return diceStr;
  const sign = targetFlatBonus > 0 ? "+" : "";
  return `${diceStr}${sign}${targetFlatBonus}`;
}

export function validatePf2eStatBlock(block: Pf2eStatBlock): StatBlockValidationResult {
  const row = TABLE_MAP.get(block.level);
  if (!row) {
    throw new Error(
      `Level ${block.level} is outside the build table range (-1 to 24). Cannot validate.`
    );
  }

  const warnings: StatBlockValidationWarning[] = [];

  // AC: [moderate - 2, moderate + 2]
  const acMin = row.ac.moderate - 2;
  const acMax = row.ac.moderate + 2;
  const clampedAc = clampField(block.ac, acMin, acMax, row.ac.moderate, "ac", block.level, warnings);

  // HP: [moderate - 15%, moderate + 15%] rounded to int
  const hpMin = Math.round(row.hp.moderate * 0.85);
  const hpMax = Math.round(row.hp.moderate * 1.15);
  const clampedHp = clampField(block.hp, hpMin, hpMax, row.hp.moderate, "hp", block.level, warnings);

  // perception: [moderate - 3, moderate + 3]
  const percMin = row.perception.moderate - 3;
  const percMax = row.perception.moderate + 3;
  const clampedPerception = clampField(
    block.perception,
    percMin,
    percMax,
    row.perception.moderate,
    "perception",
    block.level,
    warnings
  );

  // saves: [low - 1, extreme + 1] per save independently.
  // Using the full per-level save band preserves creature character — a dragon
  // may legitimately have high Fort/Will and low Ref. The old ±3 of moderate
  // was too narrow and would clamp valid archetypes. Amendment Q widens the
  // band to cover the entire table range with ±1 headroom at each end.
  const saveMin = row.savingThrow.low - 1;
  const saveMax = row.savingThrow.extreme + 1;
  const clampedFort = clampField(block.saves.fort, saveMin, saveMax, row.savingThrow.moderate, "saves.fort", block.level, warnings);
  const clampedRef = clampField(block.saves.ref, saveMin, saveMax, row.savingThrow.moderate, "saves.ref", block.level, warnings);
  const clampedWill = clampField(block.saves.will, saveMin, saveMax, row.savingThrow.moderate, "saves.will", block.level, warnings);

  // strikes
  const strikeHitMin = row.strikeBonus.moderate - 2;
  const strikeHitMax = row.strikeBonus.moderate + 2;
  const dmgMod = row.strikeDamage.average;
  const dmgMin = dmgMod - 3;
  const dmgMax = dmgMod + 3;

  const clampedStrikes: Pf2eStrike[] = block.strikes.map((strike, idx) => {
    const clampedToHit = clampField(
      strike.toHit,
      strikeHitMin,
      strikeHitMax,
      row.strikeBonus.moderate,
      `strikes[${idx}].toHit`,
      block.level,
      warnings
    );

    const parsed = parseDamageAverage(strike.damage);
    let clampedDamage = strike.damage;
    if (parsed !== null) {
      if (parsed.average < dmgMin || parsed.average > dmgMax) {
        const clampedAverage = Math.max(dmgMin, Math.min(dmgMax, parsed.average));
        const newFlat = Math.round(clampedAverage - parsed.diceAvg);
        warnings.push({
          field: `strikes[${idx}].damage`,
          level: block.level,
          expected: { min: dmgMin, max: dmgMax, moderate: dmgMod },
          actual: Math.round(parsed.average),
          clampedTo: Math.round(clampedAverage),
        });
        clampedDamage = clampDamageExpression(strike.damage, newFlat);
      }
    }

    return { ...strike, toHit: clampedToHit, damage: clampedDamage };
  });

  // spell slots: clamp dc and attack per rank if spellSlots is present.
  // Band: [moderate - 2, extreme + 2] for both spellDC and spellAttack.
  let clampedSpellSlots = block.spellSlots;
  if (block.spellSlots) {
    const dcMin = row.spellDC.moderate - 2;
    const dcMax = row.spellDC.extreme + 2;
    const attackMin = row.spellAttack.moderate - 2;
    const attackMax = row.spellAttack.extreme + 2;

    const clamped: NonNullable<Pf2eStatBlock["spellSlots"]> = {};

    for (const [rank, slot] of Object.entries(block.spellSlots)) {
      const clampedDc = clampField(
        slot.dc,
        dcMin,
        dcMax,
        row.spellDC.moderate,
        `spellSlots[${rank}].dc`,
        block.level,
        warnings
      );

      let clampedAttack = slot.attack;
      if (slot.attack !== undefined) {
        clampedAttack = clampField(
          slot.attack,
          attackMin,
          attackMax,
          row.spellAttack.moderate,
          `spellSlots[${rank}].attack`,
          block.level,
          warnings
        );
      }

      clamped[rank] = { ...slot, dc: clampedDc, attack: clampedAttack };
    }

    clampedSpellSlots = clamped;
  }

  const clamped: Pf2eStatBlock = {
    ...block,
    ac: clampedAc,
    hp: clampedHp,
    perception: clampedPerception,
    saves: { fort: clampedFort, ref: clampedRef, will: clampedWill },
    strikes: clampedStrikes,
    spellSlots: clampedSpellSlots,
  };

  return { clamped, warnings };
}
