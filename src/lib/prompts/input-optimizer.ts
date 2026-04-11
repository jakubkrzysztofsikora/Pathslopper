import type { PathfinderVersion } from "@/lib/schemas/version";

/**
 * Phase 2 — Input Optimization prompt.
 *
 * A secondary Claude pass that takes messy player prose ("I swing my sword
 * at the nearest goblin, going for the throat") and returns a single
 * PlayerIntent JSON block. Version-aware so PF2e prompts mention the
 * three-action economy and PF1e prompts reference standard/move/full-round
 * categories.
 *
 * Anti-sycophancy applies here too: if the player's prose contradicts the
 * rules (e.g., "I cast fireball five times this round"), the optimizer
 * should return a `narrative` action with a description noting the
 * limitation rather than fabricating an action cost that doesn't exist.
 */

export interface InputOptimizerPrompts {
  system: string;
  user: string;
}

export function buildInputOptimizerPrompt(
  rawInput: string,
  version: PathfinderVersion
): InputOptimizerPrompts {
  const versionNote =
    version === "pf2e"
      ? "This is Pathfinder 2e. Use the three-action economy: each intent is 1, 2, or 3 actions. Strikes are 1 action. Two-action activities (like Sudden Charge) are 2. Full rituals or 10-minute exploration tasks are `narrative`."
      : "This is Pathfinder 1e. Use standard / move / full-round action categories in the description if relevant. Do not set actionCost for PF1e intents.";

  const system = `You are the Input Optimizer for an AI Game Master running Pathfinder ${version === "pf1e" ? "1e" : "2e"}. Your job is to clean messy player prose into a single actionable PlayerIntent.

${versionNote}

Rules:
1. Return ONLY a JSON object matching this shape — no prose, no markdown, no commentary before or after:
   {
     "version": "${version}",
     "rawInput": "<verbatim player input>",
     "action": "strike" | "skill-check" | "save" | "cast-spell" | "movement" | "narrative",
     "skillOrAttack": "<e.g., Athletics, Longsword, Fireball — omit if not applicable>",
     "target": "<the target of the action, if any>",
     "description": "<one-sentence factual description>",
     "modifier": <integer, only if the player explicitly stated a numeric modifier>,
     "dc": <integer, only if the player explicitly stated a DC or AC>,
     "actionCost": <1-3 for PF2e only, omit for PF1e>
   }
2. Do NOT invent numeric modifiers or DCs. Omit those fields if the player did not provide them.
3. If the player's input is pure narration (roleplay, describing what their character says or feels) with no mechanical action, use action="narrative" and leave skillOrAttack and target empty.
4. If the player's input would violate game rules (impossible action economy, banned spell), use action="narrative" and note the rule issue in the description. Do not concede to incorrect rules arguments.
5. Output only JSON. No backticks, no markdown fences, no explanatory text.
6. When a field does not apply, OMIT THE KEY ENTIRELY. Never emit \`null\`, never emit an empty string \`""\`. For example, if there is no numeric modifier, the output must not contain a "modifier" key at all — not "modifier": null and not "modifier": "".`;

  const user = `Player input:
"""
${rawInput}
"""

Return the PlayerIntent JSON now.`;

  return { system, user };
}
