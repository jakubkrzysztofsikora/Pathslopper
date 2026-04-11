import type { StoryDNA } from "@/lib/schemas/story-dna";
import type { PathfinderVersion } from "@/lib/schemas/version";
import type { TacticalZone } from "@/lib/schemas/zone";
import { TacticalZoneSchema } from "@/lib/schemas/zone";
import { scanBannedPhrases, DEFAULT_BANNED_PHRASES } from "./banned-phrases";
import { ANTI_SYCOPHANCY_CLAUSE, POLISH_OUTPUT_CLAUSE } from "./system/gm-core";
import { extractJsonBlock } from "@/lib/llm/structured-output";

export interface ZoneSeed {
  biome: string;
  encounterIntent: string;
}

export interface ZonePromptChain {
  stageA: (version: PathfinderVersion) => { system: string; user: string };
  stageB: (polishSkeleton: string, dna: StoryDNA) => { system: string; user: string };
  stageC: (markdown: string, dna: StoryDNA) => VerifyZoneResult;
}

export interface VerifyZoneResult {
  ok: boolean;
  bannedHits: string[];
  zone?: TacticalZone;
}

export function buildZonePromptChain(
  dna: StoryDNA,
  seed: ZoneSeed
): ZonePromptChain {
  const stageA = (version: PathfinderVersion): { system: string; user: string } => {
    const versionNote =
      version === "pf2e"
        ? "Uwzględniaj system trzech akcji (three-action economy) w kosztach ruchu i działań."
        : "Uwzględniaj zmienny koszt ruchu (kwadraty 5ft → mapowanie na sąsiedztwo stref).";

    const system = `Myślisz po polsku o regułach Pathfinder ${version === "pf1e" ? "1e" : "2e"}. Zaprojektuj strefę taktyczną używając Tactical Environment Protocol (system stref, nie siatki). Wypisz: teren, osłony, wysokość, zagrożenia, oświetlenie. ${versionNote} Bez narracji — tylko mechaniczny szkielet.`;

    const user = `Zaprojektuj strefę taktyczną dla biomu: ${seed.biome}. Zamiar starcia: ${seed.encounterIntent}. Nastawienie DNA: tempo narracji=${dna.sliders.narrativePacing}, śmiertelność taktyczna=${dna.sliders.tacticalLethality}, improwizacja BN=${dna.sliders.npcImprov}.`;

    return { system, user };
  };

  const stageB = (
    polishSkeleton: string,
    currentDna: StoryDNA
  ): { system: string; user: string } => {
    // Effective banned-phrase list = DEFAULT ∪ dna.tags.exclude. The
    // verifier at Stage C scans against this same union, so listing the
    // full set in the Stage B system prompt avoids spurious retries for
    // user-added excludes the model was never explicitly forbidden.
    const effectiveBanned = Array.from(
      new Set([
        ...DEFAULT_BANNED_PHRASES,
        ...currentDna.tags.exclude,
      ].map((p) => p.toLowerCase()))
    );
    const bannedList = effectiveBanned.join(", ");
    const versionNote =
      currentDna.version === "pf2e"
        ? "Reference the three-action economy when describing movement and action costs in this zone."
        : "Reference variable movement cost using 5ft squares mapped to zone-adjacency (e.g., difficult terrain costs 2 movement to enter an adjacent zone).";

    const system = `You are an expert Game Master producing tactical zone descriptions for tabletop play.

${ANTI_SYCOPHANCY_CLAUSE}

${POLISH_OUTPUT_CLAUSE}

${versionNote}

Translate the mechanical skeleton below into Markdown narration in Polish, with concrete sensory details (mokra wełna, tanie piwo, wilgotny kamień). Include an embedded \`\`\`json\`\`\` code block that matches the TacticalZone schema exactly.

The JSON SCHEMA KEYS (name, terrain, lighting, elevation, etc.) must stay in English exactly as specified by the schema. Only the string VALUES that surface in the UI (zone name, terrain type, notes) may be in Polish. Internal enum values required by the Zod schema (e.g., terrain = "forest"/"swamp"/"urban"/"dungeon") must remain English.

Do NOT use banned phrases: ${bannedList}.

The JSON block must appear at the end of your response, fenced with \`\`\`json ... \`\`\`.`;

    const includeTags = currentDna.tags.include.length > 0
      ? `Thematic includes: ${currentDna.tags.include.join(", ")}.\n\n`
      : "";

    // Excludes are intentionally NOT duplicated in the user prompt —
    // they are already enumerated in the Stage B system prompt above.
    const user = `Mechanical skeleton (Polish):\n\n${polishSkeleton}\n\n${includeTags}Produce the Markdown narration with embedded JSON.`;

    return { system, user };
  };

  const stageC = verifyZoneOutput;

  return { stageA, stageB, stageC };
}

export function verifyZoneOutput(
  markdown: string,
  dna: StoryDNA
): VerifyZoneResult {
  const bannedHits = scanBannedPhrases(markdown, dna.tags.exclude);

  const result = extractJsonBlock(markdown, TacticalZoneSchema);

  if (!result.ok || !result.data) {
    return {
      ok: false,
      bannedHits,
      zone: undefined,
    };
  }

  return {
    ok: bannedHits.length === 0,
    bannedHits,
    zone: result.data,
  };
}
