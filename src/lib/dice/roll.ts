/**
 * Deterministic dice engine for the Adjudication phase.
 *
 * Produces a full "Audit the Math" breakdown so HITL controls can show
 * players exactly how the total was assembled, e.g.:
 *   1d20(15) + 3 STR + 2 Prof = 20
 *
 * Pure function — an optional seed yields reproducible rolls for tests.
 */

export interface ModifierTerm {
  label: string;
  value: number;
}

export interface RollInput {
  /** Number of dice to roll. */
  count: number;
  /** Number of faces per die (e.g., 20 for a d20). */
  faces: number;
  /** Additive modifiers with labels for the audit trail. */
  modifiers?: ModifierTerm[];
  /** Optional seed for reproducible tests. */
  seed?: number;
}

export interface RollResult {
  /** Canonical formula string, e.g. "1d20 + 3 STR + 2 Prof". */
  formula: string;
  /** The individual die faces that were rolled. */
  rolls: number[];
  /** The modifier terms, echoed for rendering. */
  modifiers: ModifierTerm[];
  /** Sum of rolls + all modifiers. */
  total: number;
  /**
   * Human-readable single-line breakdown suitable for UI display.
   * Example: "1d20(15) + 3 STR + 2 Prof = 20"
   */
  breakdown: string;
}

/**
 * Tiny deterministic PRNG (mulberry32) used only when a seed is provided.
 * Math.random is used otherwise so prod behaves like normal dice.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rollOne(faces: number, rand: () => number): number {
  return Math.floor(rand() * faces) + 1;
}

function formatModifier(term: ModifierTerm): string {
  const sign = term.value >= 0 ? "+" : "-";
  return `${sign} ${Math.abs(term.value)} ${term.label}`.trim();
}

export function roll(input: RollInput): RollResult {
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 100) {
    throw new Error(`Invalid dice count: ${input.count}`);
  }
  if (!Number.isInteger(input.faces) || input.faces < 2 || input.faces > 1000) {
    throw new Error(`Invalid dice faces: ${input.faces}`);
  }

  const rand =
    typeof input.seed === "number" ? mulberry32(input.seed) : Math.random;
  const rolls: number[] = [];
  for (let i = 0; i < input.count; i++) {
    rolls.push(rollOne(input.faces, rand));
  }

  const modifiers = input.modifiers ?? [];
  const rollSum = rolls.reduce((a, b) => a + b, 0);
  const modSum = modifiers.reduce((a, t) => a + t.value, 0);
  const total = rollSum + modSum;

  const diceFormula = `${input.count}d${input.faces}`;
  const modFormula = modifiers.map(formatModifier).join(" ");
  const formula = modFormula ? `${diceFormula} ${modFormula}` : diceFormula;

  const rollsDisplay =
    input.count === 1 ? `(${rolls[0]})` : `(${rolls.join(" + ")} = ${rollSum})`;
  const breakdown =
    `${diceFormula}${rollsDisplay}` +
    (modFormula ? ` ${modFormula}` : "") +
    ` = ${total}`;

  return { formula, rolls, modifiers, total, breakdown };
}

export interface CheckInput extends RollInput {
  /** Difficulty class to compare the total against. */
  dc: number;
}

export interface CheckResult extends RollResult {
  dc: number;
  /** degreeOfSuccess uses PF2e-style +/- 10 bands. */
  degreeOfSuccess: "critical-failure" | "failure" | "success" | "critical-success";
}

export function check(input: CheckInput): CheckResult {
  const result = roll(input);
  const delta = result.total - input.dc;
  let degree: CheckResult["degreeOfSuccess"];
  if (delta >= 10) degree = "critical-success";
  else if (delta >= 0) degree = "success";
  else if (delta > -10) degree = "failure";
  else degree = "critical-failure";

  // Natural 20 / natural 1 on a single d20 bumps by one degree per PF2e core rules.
  if (input.count === 1 && input.faces === 20) {
    const natural = result.rolls[0];
    if (natural === 20) {
      degree =
        degree === "critical-failure"
          ? "failure"
          : degree === "failure"
          ? "success"
          : "critical-success";
    } else if (natural === 1) {
      degree =
        degree === "critical-success"
          ? "success"
          : degree === "success"
          ? "failure"
          : "critical-failure";
    }
  }

  return {
    ...result,
    dc: input.dc,
    degreeOfSuccess: degree,
    breakdown: `${result.breakdown} vs DC ${input.dc} — ${degree.toUpperCase()}`,
  };
}
