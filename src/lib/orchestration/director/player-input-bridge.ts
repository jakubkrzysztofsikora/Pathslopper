import type { CallLLM } from "@/lib/llm/client";
import type { SessionGraph } from "@/lib/schemas/session-graph";

// ---------------------------------------------------------------------------
// DisruptionScale — how much the player's free-text deviates from graph choices
// ---------------------------------------------------------------------------

export type DisruptionScale = "small" | "medium" | "large";

// ---------------------------------------------------------------------------
// BridgeResult discriminated union
// ---------------------------------------------------------------------------

export type BridgeResult =
  | { kind: "matched-choice"; choiceIndex: number; label: string }
  | { kind: "free-adjudicate"; playerInput: string; reason: string }
  | {
      kind: "mint-ephemeral-npc";
      npcName: string;
      npcRole: string;
      playerInput: string;
    }
  | {
      kind: "disrupt";
      scale: DisruptionScale;
      playerInput: string;
      clockEffect?: { clockId: string; segments: number };
    };

// ---------------------------------------------------------------------------
// bridgePlayerInput deps
// ---------------------------------------------------------------------------

export interface BridgePlayerInputDeps {
  callLLM: CallLLM;
}

// ---------------------------------------------------------------------------
// Intent classification prompt
// ---------------------------------------------------------------------------

const BRIDGE_SYSTEM = `You are the input router for a tabletop RPG director system.
Given a player's free-text input and the available pre-authored choice labels,
classify the input into one of these categories:

1. "matched-choice": The input clearly maps to one of the available choices (by meaning/intent).
   Return: { "kind": "matched-choice", "choiceIndex": <number>, "matchedLabel": <string> }

2. "free-adjudicate": The input is a valid action but doesn't match any choice.
   Return: { "kind": "free-adjudicate", "reason": <brief why it needs adjudication> }

3. "mint-ephemeral-npc": The input introduces a new named person who is not in the scene.
   Return: { "kind": "mint-ephemeral-npc", "npcName": <name>, "npcRole": <role description> }

4. "disrupt": The input fundamentally breaks narrative flow (splitting party, going completely off-script, TPK-level action).
   Return: { "kind": "disrupt", "scale": "small"|"medium"|"large" }

Respond with valid JSON only. No markdown fences.`;

function buildBridgePrompt(
  rawText: string,
  choices: { index: number; label: string }[]
): string {
  const choiceList = choices
    .map((c) => `  ${c.index}: "${c.label}"`)
    .join("\n");
  return `Player input: "${rawText}"

Available choices:
${choiceList || "  (none)"}

Classify the player input. Respond with JSON only.`;
}

// ---------------------------------------------------------------------------
// Fuzzy / semantic matching — simple heuristic before LLM call
// Returns the choice index if a sufficiently similar label is found, else -1.
// ---------------------------------------------------------------------------

function lowerWords(text: string): string[] {
  return Array.from(new Set(text.toLowerCase().match(/\b\w+\b/g) ?? []));
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setB = new Set(b);
  let intersection = 0;
  for (const w of a) {
    if (setB.has(w)) intersection++;
  }
  const union = a.length + b.length - intersection;
  return union === 0 ? 0 : intersection / union;
}

function fuzzyMatchChoice(
  rawText: string,
  choices: { index: number; label: string }[]
): number {
  if (choices.length === 0) return -1;

  const inputWords = lowerWords(rawText);
  let bestIndex = -1;
  let bestScore = 0;

  for (const choice of choices) {
    const choiceWords = lowerWords(choice.label);
    const score = jaccard(inputWords, choiceWords);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = choice.index;
    }
  }

  // Threshold: 0.25 Jaccard overlap is enough for a fuzzy match
  return bestScore >= 0.25 ? bestIndex : -1;
}

// ---------------------------------------------------------------------------
// Simple heuristic: detect named PERSON entity introduction
// (LLM-backed in production; heuristic for test affordance)
// ---------------------------------------------------------------------------

const PERSON_INTRO_PATTERNS = [
  /\bi (ask|talk to|approach|greet|call out to) (?:the )?([A-Z][a-z]+ ?[A-Z]?[a-z]*)\b/i,
  /\b([A-Z][a-z]+ [A-Z][a-z]+)\b(?:.*(bartender|merchant|guard|stranger|wizard|innkeeper|servant|courier))/i,
  /\bi (?:look for|find|seek out) ([A-Z][a-z]+ [A-Z][a-z]+)\b/i,
];

function detectPersonEntity(rawText: string): string | null {
  for (const pattern of PERSON_INTRO_PATTERNS) {
    const match = pattern.exec(rawText);
    if (match) {
      // Return the most likely name group
      const name = match[2] ?? match[1];
      if (name && /^[A-Z]/.test(name)) return name;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Disruption heuristics — detect narrative-breaking patterns
// ---------------------------------------------------------------------------

const SPLIT_KEYWORDS = [
  "i go", "i head", "i leave", "i separate", "i split",
  "i sneak off", "i wander", "i go alone",
];

const LARGE_DISRUPTION_KEYWORDS = [
  "kill everyone", "burn it down", "destroy the building",
  "attack the party", "betray", "blow up",
];

function detectDisruption(rawText: string): DisruptionScale | null {
  const lower = rawText.toLowerCase();
  if (LARGE_DISRUPTION_KEYWORDS.some((k) => lower.includes(k))) return "large";
  if (SPLIT_KEYWORDS.some((k) => lower.includes(k))) return "medium";
  return null;
}

// ---------------------------------------------------------------------------
// bridgePlayerInput — main entry point
// ---------------------------------------------------------------------------

export async function bridgePlayerInput(
  rawText: string,
  choices: { index: number; label: string }[],
  graph: SessionGraph | null,
  deps: BridgePlayerInputDeps
): Promise<BridgeResult> {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { kind: "free-adjudicate", playerInput: rawText, reason: "empty input" };
  }

  // 1. Fuzzy match against available choices (cheap heuristic first)
  if (choices.length > 0) {
    const fuzzyIdx = fuzzyMatchChoice(trimmed, choices);
    if (fuzzyIdx >= 0) {
      const matched = choices[fuzzyIdx];
      return {
        kind: "matched-choice",
        choiceIndex: matched.index,
        label: matched.label,
      };
    }
  }

  // 2. Disruption detection
  const disruption = detectDisruption(trimmed);
  if (disruption === "large") {
    // Large disruption: tick a clock if one is available
    const firstClock = graph?.clocks[0];
    return {
      kind: "disrupt",
      scale: "large",
      playerInput: rawText,
      clockEffect: firstClock
        ? { clockId: firstClock.id, segments: 1 }
        : undefined,
    };
  }
  if (disruption === "medium") {
    return { kind: "disrupt", scale: "medium", playerInput: rawText };
  }

  // 3. Named person detection — mint ephemeral NPC
  const personName = detectPersonEntity(trimmed);
  if (personName) {
    // Check if this person already exists in the graph NPCs
    const existingNpc = graph?.npcs.find(
      (n) => n.name.toLowerCase() === personName.toLowerCase()
    );
    if (!existingNpc) {
      return {
        kind: "mint-ephemeral-npc",
        npcName: personName,
        npcRole: "unknown",
        playerInput: rawText,
      };
    }
  }

  // 4. LLM-backed classification for the remaining cases
  const prompt = buildBridgePrompt(trimmed, choices);

  let llmResponse: string;
  try {
    llmResponse = await deps.callLLM({
      system: BRIDGE_SYSTEM,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      maxTokens: 200,
    });
  } catch {
    // LLM failure → fallback to free-adjudicate
    return { kind: "free-adjudicate", playerInput: rawText, reason: "llm-unavailable" };
  }

  interface LLMBridgeResult {
    kind: string;
    choiceIndex?: number;
    matchedLabel?: string;
    reason?: string;
    npcName?: string;
    npcRole?: string;
    scale?: string;
  }

  let parsed: LLMBridgeResult;
  try {
    const jsonText = llmResponse
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    parsed = JSON.parse(jsonText) as LLMBridgeResult;
  } catch {
    return { kind: "free-adjudicate", playerInput: rawText, reason: "llm-parse-error" };
  }

  switch (parsed.kind) {
    case "matched-choice": {
      const idx = parsed.choiceIndex ?? -1;
      const choice = choices[idx];
      if (!choice) {
        return { kind: "free-adjudicate", playerInput: rawText, reason: "invalid-choice-index" };
      }
      return { kind: "matched-choice", choiceIndex: idx, label: choice.label };
    }
    case "mint-ephemeral-npc":
      return {
        kind: "mint-ephemeral-npc",
        npcName: parsed.npcName ?? "Unknown",
        npcRole: parsed.npcRole ?? "stranger",
        playerInput: rawText,
      };
    case "disrupt": {
      const scale =
        parsed.scale === "large" || parsed.scale === "medium" || parsed.scale === "small"
          ? parsed.scale
          : "small";
      return { kind: "disrupt", scale, playerInput: rawText };
    }
    default:
      return {
        kind: "free-adjudicate",
        playerInput: rawText,
        reason: parsed.reason ?? "unclassified",
      };
  }
}
