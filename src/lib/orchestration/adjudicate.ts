import type { PlayerIntent } from "@/lib/schemas/player-intent";
import type {
  AdjudicationResult,
} from "@/lib/schemas/adjudication";
import type { CharacterSheetParsed } from "@/lib/schemas/character-sheet";
import { check, roll, type ModifierTerm } from "@/lib/dice/roll";

/**
 * Phase 3 orchestrator — deterministic adjudication.
 *
 * Takes an optimized PlayerIntent and resolves it against a dice engine.
 * The "single source of truth" for modifier breakdown is this file — the
 * LLM never computes totals, so there is no math to hallucinate. SRD RAG
 * (layer 2 of the verification stack) will land in a later tranche to
 * supply per-skill proficiency bonuses and difficulty classes; for now
 * the caller supplies the modifier and DC via PlayerIntent overrides or
 * defaults from the character sheet (when that wiring lands).
 *
 * Pure function — takes an optional seed for reproducible tests.
 */

export interface AdjudicateOptions {
  /** Reproducible seed for tests. Omit in production. */
  seed?: number;
  /** Default modifier to use when the intent has none. */
  defaultModifier?: number;
  /** Character sheet for auto-deriving modifier from proficiencies / stats. */
  character?: CharacterSheetParsed;
  /**
   * SRD rules snippets retrieved by the RAG pipeline. Appended to the
   * summary as a "Rules Reference" section for display to the player.
   *
   * TRUST BOUNDARY: srdContext is display-only. NEVER parse it for modifiers/DCs.
   */
  srdContext?: string;
}

export function adjudicate(
  intent: PlayerIntent,
  options: AdjudicateOptions = {}
): AdjudicationResult {
  // Pure narrative intents don't need a roll.
  if (intent.action === "narrative") {
    return {
      intent,
      roll: {
        formula: "",
        rolls: [],
        modifiers: [],
        total: 0,
        breakdown: "(brak rzutu — akcja narracyjna)",
      },
      outcome: "narrative",
      summary: intent.description,
    };
  }

  const modifierValue =
    intent.modifier ??
    options.defaultModifier ??
    deriveModifierFromCharacter(intent, options.character) ??
    0;
  const modifiers: ModifierTerm[] = [];
  if (modifierValue !== 0) {
    const label = labelForIntent(intent);
    modifiers.push({ label, value: modifierValue });
  }

  const rollInput = {
    count: 1,
    faces: 20,
    modifiers,
    seed: options.seed,
  };

  // If the intent carries a DC/AC we run a check and surface the degree of
  // success. Otherwise we roll raw and leave the GM / UI to interpret.
  if (typeof intent.dc === "number") {
    const result = check({ ...rollInput, dc: intent.dc });
    let summary = summariseCheck(intent, result.degreeOfSuccess, result.total);
    if (options.srdContext) {
      summary += `\n\nŹródło reguł:\n${options.srdContext}`;
    }
    return {
      intent,
      roll: {
        formula: result.formula,
        rolls: result.rolls,
        modifiers: result.modifiers,
        total: result.total,
        breakdown: result.breakdown,
        dc: result.dc,
        degreeOfSuccess: result.degreeOfSuccess,
      },
      outcome: "resolved",
      summary,
    };
  }

  const result = roll(rollInput);
  let needsDcSummary = `Wyrzucono ${result.total} — brak KT, Mistrz Gry musi ustalić trudność.`;
  if (options.srdContext) {
    needsDcSummary += `\n\nŹródło reguł:\n${options.srdContext}`;
  }
  return {
    intent,
    roll: {
      formula: result.formula,
      rolls: result.rolls,
      modifiers: result.modifiers,
      total: result.total,
      breakdown: result.breakdown,
    },
    outcome: "needs-dc",
    summary: needsDcSummary,
  };
}

function labelForIntent(intent: PlayerIntent): string {
  if (intent.skillOrAttack) return intent.skillOrAttack;
  switch (intent.action) {
    case "strike":
      return "Attack";
    case "skill-check":
      return "Skill";
    case "save":
      return "Save";
    case "cast-spell":
      return "Spell";
    case "movement":
      return "Movement";
    default:
      return "Modifier";
  }
}

function summariseCheck(
  intent: PlayerIntent,
  degree: string,
  total: number
): string {
  const target = intent.target ? ` na cel: ${intent.target}` : "";
  const verb = intent.skillOrAttack ?? intent.action;
  const degreeLabel =
    degree === "critical-success"
      ? "krytyczny sukces"
      : degree === "success"
      ? "sukces"
      : degree === "failure"
      ? "porażka"
      : degree === "critical-failure"
      ? "krytyczna porażka"
      : degree;
  return `${verb}${target}: wyrzucono ${total} — ${degreeLabel}.`;
}

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Derive a modifier from the character sheet based on the intent.
 * Returns undefined when no relevant data is found so the caller can fall
 * back further (to 0).
 */
function deriveModifierFromCharacter(
  intent: PlayerIntent,
  character?: CharacterSheetParsed
): number | undefined {
  if (!character) return undefined;

  if (character.version === "pf2e") {
    const skill = intent.skillOrAttack?.toLowerCase();

    // For saves, we don't derive from PF2e proficiency here — keep simple.
    // For strikes, use STR ability mod as the relevant ability.
    if (intent.action === "strike") {
      return abilityMod(character.abilityScores.str);
    }

    // Look up proficiency rank for the skill.
    if (skill) {
      // Case-insensitive lookup in proficiencies record.
      const proficiencyEntry = Object.entries(character.proficiencies).find(
        ([key]) => key.toLowerCase() === skill
      );
      if (proficiencyEntry) {
        const rank = proficiencyEntry[1];
        const level = character.level;
        let profBonus: number;
        switch (rank) {
          case "untrained":
            profBonus = 0;
            break;
          case "trained":
            profBonus = level + 2;
            break;
          case "expert":
            profBonus = level + 4;
            break;
          case "master":
            profBonus = level + 6;
            break;
          case "legendary":
            profBonus = level + 8;
            break;
          default:
            profBonus = 0;
        }

        // Determine the key ability for the skill.
        // Use a simple heuristic: STR for Athletics, DEX for Acrobatics/Thievery/Stealth,
        // INT for Arcana/Crafting/Occultism/Society, WIS for Medicine/Nature/Perception/Religion/Survival,
        // CHA for Deception/Diplomacy/Intimidation/Performance. Default to INT.
        const abilityForSkill = getKeyAbilityPF2e(skill, character.abilityScores);
        return profBonus + abilityForSkill;
      }
    }

    return undefined;
  }

  if (character.version === "pf1e") {
    // For strikes, use BAB + STR mod.
    if (intent.action === "strike") {
      return character.bab + abilityMod(character.abilityScores.str);
    }

    // For saves, use the relevant save bonus.
    if (intent.action === "save") {
      const saveKey = intent.skillOrAttack?.toLowerCase();
      if (saveKey === "fortitude" || saveKey === "fort") {
        return character.saves.fortitude;
      }
      if (saveKey === "reflex" || saveKey === "ref") {
        return character.saves.reflex;
      }
      if (saveKey === "will") {
        return character.saves.will;
      }
    }

    // Otherwise use STR mod as a generic fallback.
    return abilityMod(character.abilityScores.str);
  }

  return undefined;
}

function getKeyAbilityPF2e(
  skill: string,
  abilityScores: { str: number; dex: number; con: number; int: number; wis: number; cha: number }
): number {
  const strSkills = ["athletics"];
  const dexSkills = ["acrobatics", "stealth", "thievery"];
  const intSkills = ["arcana", "crafting", "occultism", "society", "lore"];
  const wisSkills = ["medicine", "nature", "perception", "religion", "survival"];
  const chaSkills = ["deception", "diplomacy", "intimidation", "performance"];

  const s = skill.toLowerCase();
  if (strSkills.includes(s)) return abilityMod(abilityScores.str);
  if (dexSkills.includes(s)) return abilityMod(abilityScores.dex);
  if (intSkills.includes(s)) return abilityMod(abilityScores.int);
  if (wisSkills.includes(s)) return abilityMod(abilityScores.wis);
  if (chaSkills.includes(s)) return abilityMod(abilityScores.cha);
  // Default to INT for unknown skills
  return abilityMod(abilityScores.int);
}
