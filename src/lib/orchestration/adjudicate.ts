import type { PlayerIntent } from "@/lib/schemas/player-intent";
import type {
  AdjudicationResult,
} from "@/lib/schemas/adjudication";
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
        breakdown: "(no roll — narrative intent)",
      },
      outcome: "narrative",
      summary: intent.description,
    };
  }

  const modifierValue = intent.modifier ?? options.defaultModifier ?? 0;
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
    const summary = summariseCheck(intent, result.degreeOfSuccess, result.total);
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
    summary: `Rolled ${result.total} — no DC provided, GM must set difficulty.`,
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
  const target = intent.target ? ` against ${intent.target}` : "";
  const verb = intent.skillOrAttack ?? intent.action;
  return `${verb}${target}: rolled ${total} — ${degree.replace("-", " ")}.`;
}
