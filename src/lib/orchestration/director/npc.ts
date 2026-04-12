/**
 * npc.ts — Combat resolution helpers (Phase 5D).
 *
 * combat-rolled: initiative + single-strike-per-turn + HP tracking.
 * combat-narrative: returns a narration summary prompt.
 *
 * These are pure functions — no I/O, no side effects.
 */

import type { Npc, Pf2eStatBlock, SimpleStatBlock } from "@/lib/schemas/session-graph";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CombatantState {
  npcId: string;
  name: string;
  maxHp: number;
  currentHp: number;
  initiative: number;
}

export interface StrikeResult {
  attackerId: string;
  targetId: string;
  /** raw d20 roll */
  roll: number;
  toHit: number;
  ac: number;
  /** damage expression resolved to a number */
  damageDealt: number;
  /** "critical-hit" | "hit" | "miss" | "critical-miss" */
  outcome: "critical-hit" | "hit" | "miss" | "critical-miss";
}

export interface TurnSummary {
  round: number;
  strikes: StrikeResult[];
  states: CombatantState[];
  ended: boolean;
  /** null if combat ongoing */
  winningSide: "pcs" | "npcs" | null;
}

// ---------------------------------------------------------------------------
// Roll helpers (deterministic seed optional — uses Math.random for MVP)
// ---------------------------------------------------------------------------

function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

function rollDamage(expression: string): number {
  // Supports "2d6+4", "1d8", "4d4-1" patterns
  const match = expression.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!match) return 0;
  const count = parseInt(match[1], 10);
  const sides = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3], 10) : 0;
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += Math.floor(Math.random() * sides) + 1;
  }
  return Math.max(0, total + modifier);
}

function getDegreeOfSuccess(roll: number, toHit: number, ac: number): StrikeResult["outcome"] {
  const total = roll + toHit;
  if (roll === 20 || total >= ac + 10) return "critical-hit";
  if (roll === 1 && total < ac) return "critical-miss";
  if (total >= ac) return "hit";
  return "miss";
}

// ---------------------------------------------------------------------------
// initCombatants — build initial CombatantState[] from Npc list
// ---------------------------------------------------------------------------

export function initCombatants(npcs: Npc[]): CombatantState[] {
  return npcs
    .filter((npc) => npc.statBlock !== undefined)
    .map((npc) => {
      const sb = npc.statBlock!;
      return {
        npcId: npc.id,
        name: npc.name,
        maxHp: sb.hp,
        currentHp: sb.hp,
        initiative: rollD20() + (sb.tier === "pf2e" ? sb.perception : 2),
      };
    })
    .sort((a, b) => b.initiative - a.initiative);
}

// ---------------------------------------------------------------------------
// resolveStrike — one NPC attacks one target
// ---------------------------------------------------------------------------

export function resolveStrike(
  attacker: CombatantState,
  target: CombatantState,
  statBlock: Pf2eStatBlock | SimpleStatBlock,
  partyLevel: number = 3
): StrikeResult {
  // PF2e moderate AC for a trained PC with moderate armor:
  // ~10 + level + 8 (trained proficiency + moderate armor bonus)
  // At level 1: ~19, level 5: ~23, level 10: ~28
  const targetAc = 10 + partyLevel + 8;

  if (statBlock.tier === "simple") {
    // Simplified: 65% hit chance, d6+2 damage
    const roll = rollD20();
    const hit = roll >= 7;
    const damageDealt = hit ? rollDamage("1d6+2") : 0;
    return {
      attackerId: attacker.npcId,
      targetId: target.npcId,
      roll,
      toHit: 0,
      ac: targetAc,
      damageDealt,
      outcome: hit ? "hit" : "miss",
    };
  }

  const strike = statBlock.strikes[0];
  if (!strike) {
    return {
      attackerId: attacker.npcId,
      targetId: target.npcId,
      roll: 1,
      toHit: statBlock.strikes[0]?.toHit ?? 0,
      ac: targetAc,
      damageDealt: 0,
      outcome: "miss",
    };
  }

  const roll = rollD20();
  const ac = targetAc;
  const outcome = getDegreeOfSuccess(roll, strike.toHit, ac);
  let damageDealt = 0;
  if (outcome === "critical-hit") {
    damageDealt = rollDamage(strike.damage) * 2;
  } else if (outcome === "hit") {
    damageDealt = rollDamage(strike.damage);
  }

  return {
    attackerId: attacker.npcId,
    targetId: target.npcId,
    roll,
    toHit: strike.toHit,
    ac: targetAc,
    damageDealt,
    outcome,
  };
}

// ---------------------------------------------------------------------------
// resolveCombatRound — one full round of combat
// ---------------------------------------------------------------------------

export function resolveCombatRound(
  round: number,
  combatants: CombatantState[],
  npcs: Npc[],
  /** If true, NPCs attack a dummy "PC" tracker; otherwise the first combatant */
  npcAttacksDummy: boolean = true,
  partyLevel: number = 3
): TurnSummary {
  const npcById = new Map(npcs.map((n) => [n.id, n]));
  const strikes: StrikeResult[] = [];
  const states = combatants.map((c) => ({ ...c }));

  for (const combatant of states) {
    if (combatant.currentHp <= 0) continue;

    const npc = npcById.get(combatant.npcId);
    if (!npc?.statBlock) continue;

    // Pick a target — for MVP, attack the "party" represented as a dummy HP pool
    // We track damage against a shared PC HP pool via a sentinel entry (id="__pcs__")
    const pcTarget = states.find((s) => s.npcId === "__pcs__") ?? {
      npcId: "__pcs__",
      name: "Drużyna",
      maxHp: 100,
      currentHp: 100,
      initiative: 0,
    };

    const strike = resolveStrike(combatant, pcTarget, npc.statBlock, partyLevel);
    strikes.push(strike);

    // Dummy target takes damage (not tracked in states for MVP)
  }

  const allDead = states.every((c) => c.currentHp <= 0);
  return {
    round,
    strikes,
    states,
    ended: allDead || round >= 10,
    winningSide: allDead ? "pcs" : round >= 10 ? "npcs" : null,
  };
}

// ---------------------------------------------------------------------------
// buildCombatNarrativePrompt — for combat-narrative nodes
// ---------------------------------------------------------------------------

export function buildCombatNarrativePrompt(
  nodeTitle: string,
  synopsis: string,
  npcNames: string[]
): string {
  return (
    `Jesteś Mistrzem Gry Pathfinder 2e. Opowiedz scenę walki: "${nodeTitle}".\n` +
    `Streszczenie: ${synopsis}\n` +
    `Przeciwnicy: ${npcNames.join(", ")}\n\n` +
    "Opisz dramatycznie walkę w 2-3 zdaniach. Zakończ pytaniem do graczy o ich działanie. Język: polski."
  );
}
