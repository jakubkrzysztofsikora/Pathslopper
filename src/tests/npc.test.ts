import { describe, it, expect } from "vitest";
import {
  initCombatants,
  resolveCombatRound,
  buildCombatNarrativePrompt,
  resolveStrike,
} from "@/lib/orchestration/director/npc";
import type { Npc } from "@/lib/schemas/session-graph";

const SIMPLE_NPC: Npc = {
  id: "npc-1",
  name: "Goblin",
  role: "enemy",
  goal: "Attack",
  voice: "Screechy",
  disposition: -3,
  statBlock: {
    tier: "simple",
    hp: 20,
    threat: "trivial",
  },
};

const PF2E_NPC: Npc = {
  id: "npc-2",
  name: "Kapitan",
  role: "boss",
  goal: "Defend",
  voice: "Commanding",
  disposition: -2,
  statBlock: {
    tier: "pf2e",
    level: 3,
    ac: 19,
    hp: 45,
    perception: 9,
    saves: { fort: 10, ref: 7, will: 6 },
    strikes: [{ name: "Miecz", toHit: 11, damage: "1d8+4", traits: ["agile"] }],
    resistances: [],
    weaknesses: [],
    immunities: [],
    specialAbilities: [],
    reactions: [],
  },
};

describe("initCombatants", () => {
  it("returns a combatant for each NPC with a statBlock", () => {
    const npcNoBlock: Npc = { id: "npc-x", name: "X", role: "r", goal: "g", voice: "v", disposition: 0 };
    const result = initCombatants([SIMPLE_NPC, PF2E_NPC, npcNoBlock]);
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.currentHp > 0)).toBe(true);
  });

  it("sorts by initiative descending", () => {
    const result = initCombatants([SIMPLE_NPC, PF2E_NPC]);
    expect(result[0].initiative).toBeGreaterThanOrEqual(result[1]?.initiative ?? -Infinity);
  });

  it("assigns correct maxHp from statBlock", () => {
    const result = initCombatants([SIMPLE_NPC]);
    expect(result[0].maxHp).toBe(20);
    expect(result[0].currentHp).toBe(20);
  });
});

describe("resolveStrike", () => {
  it("returns a StrikeResult with a valid outcome for pf2e stat block", () => {
    const attacker = { npcId: "npc-2", name: "Kapitan", maxHp: 45, currentHp: 45, initiative: 10 };
    const target = { npcId: "__pcs__", name: "Drużyna", maxHp: 100, currentHp: 100, initiative: 0 };
    const result = resolveStrike(attacker, target, PF2E_NPC.statBlock!);
    expect(["critical-hit", "hit", "miss", "critical-miss"]).toContain(result.outcome);
    if (result.outcome === "hit" || result.outcome === "critical-hit") {
      expect(result.damageDealt).toBeGreaterThan(0);
    }
  });

  it("returns a StrikeResult for simple stat block", () => {
    const attacker = { npcId: "npc-1", name: "Goblin", maxHp: 20, currentHp: 20, initiative: 5 };
    const target = { npcId: "__pcs__", name: "Drużyna", maxHp: 100, currentHp: 100, initiative: 0 };
    const result = resolveStrike(attacker, target, SIMPLE_NPC.statBlock!);
    expect(result.attackerId).toBe("npc-1");
  });
});

describe("resolveCombatRound", () => {
  it("returns a TurnSummary with round number", () => {
    const combatants = initCombatants([SIMPLE_NPC]);
    const summary = resolveCombatRound(1, combatants, [SIMPLE_NPC]);
    expect(summary.round).toBe(1);
    expect(summary.strikes).toBeDefined();
  });

  it("ends at round 10 (safety valve)", () => {
    const combatants = initCombatants([SIMPLE_NPC]);
    const summary = resolveCombatRound(10, combatants, [SIMPLE_NPC]);
    expect(summary.ended).toBe(true);
  });
});

describe("buildCombatNarrativePrompt", () => {
  it("returns a string prompt containing the node title", () => {
    const prompt = buildCombatNarrativePrompt("Bitwa w bramie", "Straż atakuje.", ["Goblin", "Kapitan"]);
    expect(prompt).toContain("Bitwa w bramie");
    expect(prompt).toContain("Goblin");
  });
});
