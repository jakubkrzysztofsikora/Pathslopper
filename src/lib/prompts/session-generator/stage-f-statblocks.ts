import { z } from "zod";
import type { SessionGraph } from "@/lib/schemas/session-graph";
import { Pf2eStatBlockSchema } from "@/lib/schemas/session-graph";

export const STAGE_F_TEMPERATURE = 0.2;

export const StageFStatBlocksSchema = z.object({
  statBlocks: z.record(z.string(), Pf2eStatBlockSchema),
});

export type StageFStatBlocks = z.infer<typeof StageFStatBlocksSchema>;

export interface StageFInput {
  graph: Omit<SessionGraph, "createdAt" | "updatedAt" | "validatedAt">;
  /**
   * Authoritative party level from the SessionBrief. Stage F MUST NOT
   * guess this from graph heuristics — doing so produced level-3 blocks
   * for level-8 parties in review. The orchestrator plumbs
   * `brief.partyLevel` through here explicitly.
   */
  partyLevel: number;
}

export function buildStageFPrompt(input: StageFInput): { system: string; user: string } {
  // Stage F is mechanical — English output, no Polish prose required.
  // POLISH_OUTPUT_CLAUSE is NOT prepended here; stat block fields are numbers + dice expressions.
  //
  // The downstream validator (pf2e-statblock-validator.ts) clamps every
  // value to the legal GMG Table 2-5 band for the creature's level.
  // Stage F's job is to emit values in the right ballpark; the
  // validator guarantees legality.

  const combatNpcList = input.graph.npcs
    .filter((n) => {
      // Only generate pf2e blocks for NPCs flagged as combat.
      // Tier="simple" NPCs get single-stat narrative blocks (not this stage).
      // Tier="pf2e" means the NPC already has a stat block skeleton to fill.
      // NPCs with no statBlock at all are non-combat (innkeeper, informant) — SKIP.
      return n.statBlock?.tier === "simple" || n.statBlock?.tier === "pf2e";
    })
    .map((n) => ({
      id: n.id,
      name: n.name,
      role: n.role,
      goal: n.goal,
      existingTier: n.statBlock?.tier ?? "none",
    }));

  const system = `You are a Pathfinder 2e rules expert generating NPC stat blocks for a TTRPG session.

Your task: for every NPC listed, emit a Pf2eStatBlock following Pathfinder 2e Gamemastery Guide Table 2-5 "Building Creatures" guidelines.

STAT BLOCK RULES (Table 2-5 — moderate values unless role calls for high/low):
- AC = 14 + level (moderate baseline; +2 for heavily armored, -2 for fragile)
- HP = (level * 15) + 20 (moderate baseline; brute = ×1.4, artillery = ×0.7)
- Perception = level + 5 (moderate)
- Saves (moderate): Fort = level + 7, Ref = level + 5, Will = level + 7
  NOTE: PF2e creatures legitimately have save asymmetry — a dragon can have
  high Fort/Will and low Ref. The validator tolerates [low - 1, extreme + 1]
  per save, so do not flatten saves.
- Strike to-hit (moderate) = level + 7; damage = level/2 + 4 (dice expression)
- Spell DC (if caster) = 14 + level; spell attack = level + 4

DICE EXPRESSIONS: use standard notation — "1d8+4 slashing", "2d6+3 fire"
TRAITS: use PF2e official trait names — "agile", "finesse", "reach 10 ft", "deadly d8", "versatile P"
SPECIAL ABILITIES: brief string descriptions — "Attack of Opportunity [Reaction]", "Breath Weapon (2d6 fire, DC 18, 30-foot cone)"
RESISTANCES/WEAKNESSES: only if thematically justified (undead → positive damage weakness, etc.)

OUTPUT SCHEMA — emit ONLY this JSON, no prose:
{
  "statBlocks": {
    "npcId": {
      "tier": "pf2e",
      "level": number,
      "ac": number,
      "hp": number,
      "perception": number,
      "saves": { "fort": number, "ref": number, "will": number },
      "strikes": [{ "name": string, "toHit": number, "damage": string, "traits": string[] }],
      "resistances": [{ "type": string, "value": number }],
      "weaknesses": [{ "type": string, "value": number }],
      "immunities": string[],
      "specialAbilities": string[],
      "reactions": string[],
      "spellSlots": { "1": { "slots": number, "dc": number, "attack": number, "list": string[] } }
    }
  }
}

NOTE: The downstream validator will clamp values to legal Table 2-5 ranges for the creature's level.
Aim for moderate-tier values unless the NPC role explicitly demands high (boss) or low (minion).`;

  const user = `Generate pf2e stat blocks for these combat NPCs.

PARTY LEVEL: ${input.partyLevel} (authoritative from SessionBrief).
- Boss NPCs: party level + 3 (extreme)
- Elite NPCs: party level + 1 (high)
- Standard combat NPCs: party level (moderate)
- Minion NPCs: party level - 2 (low)

COMBAT NPCs REQUIRING STAT BLOCKS:
${combatNpcList.length > 0 ? JSON.stringify(combatNpcList, null, 2) : "(none — no combat-tagged NPCs in the graph; emit an empty statBlocks object)"}

GRAPH CONTEXT (from scenes):
Session tone: ${input.graph.nodes.slice(0, 3).map((n) => n.title).join(", ")}

Emit JSON with statBlocks keyed by NPC id. No prose, no Markdown.`;

  return { system, user };
}
