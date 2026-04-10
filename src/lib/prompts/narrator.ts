import type { PathfinderVersion } from "@/lib/schemas/version";
import type { SessionState, Turn } from "@/lib/schemas/session";
import { DEFAULT_BANNED_PHRASES } from "./banned-phrases";
import { ANTI_SYCOPHANCY_CLAUSE } from "./system/gm-core";

/**
 * Phase 1 — Narration prompt.
 *
 * Produces a GM-voice description of the current scene, deterministically
 * anchored to the session's world-state hash. The hash is surfaced in the
 * prompt so the model treats the passed state as authoritative ("this is
 * the reality, narrate against it"), blocking the drift where a long-
 * running LLM starts re-imagining facts from earlier turns.
 *
 * The prompt forbids the slop phrases from banned-phrases.ts and carries
 * the anti-sycophancy clause. Re-uses the same system/gm-core.ts lever as
 * the zone generator so tone stays consistent across phases.
 */

export interface NarratorPrompts {
  system: string;
  user: string;
}

export interface NarratorInput {
  session: SessionState;
  version: PathfinderVersion;
  /** Optional extra scene seed the client can provide to bias narration (e.g., "the party approaches the chapel"). */
  sceneSeed?: string;
  /** Optional world-state hash override (tests pass this; prod recomputes server-side). */
  worldStateHash: string;
}

const MAX_TURNS_IN_CONTEXT = 12;

function formatTurnForContext(turn: Turn, index: number): string {
  if (turn.kind === "narration") {
    return `(${index + 1}) [narration @ ${turn.at}]\n${turn.markdown.slice(0, 600)}`;
  }
  if (turn.kind === "manager-override") {
    return `(${index + 1}) [manager-override @ ${turn.at}]\n  Override: ${turn.forcedOutcome.slice(0, 300)}`;
  }
  const intent = turn.intent;
  const roll = turn.result.roll;
  const rollLine = roll.breakdown ? `Roll: ${roll.breakdown}` : "Roll: (no roll)";
  const outcome = turn.result.summary;
  const skill = intent.skillOrAttack ? ` (${intent.skillOrAttack})` : "";
  const target = intent.target ? ` -> ${intent.target}` : "";
  return `(${index + 1}) [${intent.action}${skill}${target} @ ${turn.at}]\n  Player: "${intent.rawInput}"\n  ${rollLine}\n  Outcome: ${outcome}`;
}

export function buildNarratorPrompt(input: NarratorInput): NarratorPrompts {
  const { session, version, sceneSeed, worldStateHash } = input;

  const versionNote =
    version === "pf2e"
      ? "Pathfinder 2e — reference the three-action economy if tactical options are visible in the scene."
      : "Pathfinder 1e — story-forward simulation; reference variable movement costs if tactical options matter.";

  const recentTurns = session.turns.slice(-MAX_TURNS_IN_CONTEXT);
  const turnSummary =
    recentTurns.length > 0
      ? recentTurns.map(formatTurnForContext).join("\n\n")
      : "(session has no turns yet — this is the opening scene.)";

  const bannedList = DEFAULT_BANNED_PHRASES.join(", ");

  const system = `You are the Game Master narrating a scene for Pathfinder Nexus.

${ANTI_SYCOPHANCY_CLAUSE}

${versionNote}

Rules:
1. The session state below is AUTHORITATIVE. You are narrating against the current world-state hash \`${worldStateHash}\`. Do not re-imagine or contradict resolved turns; treat every dice outcome in the log as canon.
2. Write 2 to 4 paragraphs of evocative second-person present-tense narration. Use concrete sensory detail: wet wool, cheap ale, scraped iron. Avoid abstract metaphor.
3. Do NOT describe what the PCs intend or decide — that is the player's job. Describe the scene, the environment, and the observable reactions of NPCs, not character interiority.
4. Do NOT use any of these banned phrases: ${bannedList}.
5. Output plain Markdown. No JSON, no code fences, no headings, no lists — just prose.`;

  const seedLine = sceneSeed
    ? `Scene seed from player: "${sceneSeed}"\n\n`
    : "";

  const user = `${seedLine}Recent session turns (oldest first):\n\n${turnSummary}\n\nNarrate the current scene now.`;

  return { system, user };
}
