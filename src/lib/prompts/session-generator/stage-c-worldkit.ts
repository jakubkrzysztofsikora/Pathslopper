import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { SessionBrief } from "@/lib/schemas/session-brief";
import {
  NpcSchema,
  LocationSchema,
  SecretSchema,
  ClockSchema,
} from "@/lib/schemas/session-graph";
import { POLISH_OUTPUT_CLAUSE } from "@/lib/prompts/system/gm-core";
import type { StageASkeleton } from "./stage-a-skeleton";
import type { StageBScenes } from "./stage-b-scenes";

export const STAGE_C_TEMPERATURE = 0.2;

export const StageCWorldKitSchema = z.object({
  npcs: z.array(NpcSchema).min(3).max(12),
  locations: z.array(LocationSchema).min(2).max(10),
  // Three-Clue Rule (Alexandrian) — enforcement is in the prompt text
  // below: "each conclusionTag must be reachable from ≥3 different
  // secrets". Schema min stays at 6 to match SessionGraphSchema final
  // assembly + existing fixtures. A future follow-up can add a
  // superRefine that counts per-conclusionTag secrets on the
  // assembled graph and rejects graphs where any tag has <3.
  secrets: z.array(SecretSchema).min(6).max(20),
  clocks: z.array(ClockSchema).min(2).max(8),
});

export type StageCWorldKit = z.infer<typeof StageCWorldKitSchema>;

/**
 * JSON Schema for server-side constrained decoding via Scaleway
 * response_format: { type: "json_schema" }. All $refs are inlined
 * (no $ref pointers) so the endpoint can validate the schema without
 * a resolver.
 */
export const STAGE_C_JSON_SCHEMA = zodToJsonSchema(StageCWorldKitSchema, {
  name: "StageCWorldKit",
  $refStrategy: "none",
}) as object;

export interface StageCInput {
  brief: SessionBrief;
  skeleton: StageASkeleton;
  scenes: StageBScenes;
}

export function buildStageCPrompt(input: StageCInput): { system: string; user: string } {
  const safetyBlock =
    input.brief.safetyTools.lines.length > 0
      ? `\nBEZWZGLĘDNIE ZAKAZANE TEMATY: ${input.brief.safetyTools.lines.join(", ")}.`
      : "";

  const npcCountHint = Math.min(12, Math.max(3, input.scenes.scenes.length / 3 | 0));
  const locationCountHint = Math.min(10, Math.max(2, input.scenes.scenes.length / 4 | 0));

  const system = `${POLISH_OUTPUT_CLAUSE}

Jesteś Mistrzem Gry kompletującym rekwizytorium sesji Pathfinder 2e. Pracujesz ze szkieletem aktów, frontów i listą scen. Twój cel: zebrać skrzynię GM — NPC, lokacje, tajemnice i zegary — bez pisania prozy narracyjnej. Myślisz jak scenograf, nie jak narrator.
${safetyBlock}

REGUŁY TAJEMNIC (Aleksandryjska Reguła Trzech Wskazówek):
- KAŻDY conclusionTag (odkrycie lub wniosek fabularny) MUSI być osiągalny z CO NAJMNIEJ 3 różnych tajemnic
- Tajemnice różnią się metodą dostarczenia (delivery): npc-dialog, environmental, document, overheard, pc-backstory, skill-check
- Sekret z delivery="skill-check" zakłada konkretny test umiejętności (np. "Przypominanie Wiedzy: Historia ST 18")
- Tajemnica może wymagać wcześniejszego odkrycia innej (requires: [id]) — ale nie twórz łańcuchów dłuższych niż 2

REGUŁY ZEGARÓW (Blades in the Dark / PbtA):
- Zegar = niezależna eskalacja w tle
- segments: 4 (szybkie zdarzenie), 6 (standardowe zagrożenie), 8 (epicki łuk)
- polarity: "danger" (krok bliżej katastrofy), "opportunity" (krok bliżej szansy), "neutral"
- tickSources: które zdarzenia wypełniają zegar — default ["hard-move", "fail"]
- Każdy front z Stage A powinien mieć co najmniej 1 powiązany zegar (frontId)

REGUŁY NPC:
- Każdy NPC: unikalny id, rola, cel, głos (1-zdaniowy), nastawienie -3..3
- statBlock: TYLKO dla NPC otagowanych jako combat — wtedy tier="simple" lub tier="pf2e"
- Dla combat NPC w sesji z partyLevel=${input.brief.partyLevel}: używaj tier="simple" z threat odpowiednim do roli (trivial/low/moderate/severe)

REGUŁY LOKACJI (Lazy DM):
- Każda lokacja ma 2-5 aspektów (evocative aspects) — konkretne, sensoryczne, grywalnoś ciowe
- Aspekty to narzędzia narracyjne: "wilgotne szczury za ścianą", "zapach spalonego siarki"

SCHEMA WYJŚCIA:
{
  "npcs": [{
    "id": string, "name": string, "role": string, "goal": string,
    "voice": string, "disposition": number,
    "statBlock": { "tier": "simple", "hp": number, "threat": "trivial|low|moderate|severe" } // opcjonalne, tylko combat
  }],
  "locations": [{ "id": string, "name": string, "aspects": string[] }],
  "secrets": [{
    "id": string, "text": string, "conclusionTag": string,
    "delivery": "npc-dialog|environmental|document|overheard|pc-backstory|skill-check",
    "requires": string[] // opcjonalne
  }],
  "clocks": [{
    "id": string, "label": string, "segments": 4|6|8,
    "polarity": "danger|opportunity|neutral",
    "tickSources": string[],
    "frontId": string // opcjonalne
  }]
}`;

  const fewShot = `PRZYKŁAD TAJEMNIC spełniających Regułę Trzech (conclusionTag = "veras_holt_winny"):
[
  { "id": "s01", "text": "Ledger shows payments to city guards signed 'V.H.'", "conclusionTag": "veras_holt_winny", "delivery": "document" },
  { "id": "s02", "text": "Stary doker widział Holta w magazynie noc przed śmiercią Kowalskiego", "conclusionTag": "veras_holt_winny", "delivery": "npc-dialog" },
  { "id": "s03", "text": "Wyryte inicjały V.H. na zamku piwnicy obok ciała", "conclusionTag": "veras_holt_winny", "delivery": "environmental" },
  { "id": "s04", "text": "Test Przypominania Wiedzy: Prawo ST 18 — Holt ma immunitet dyplomatyczny wygasający pojutrze", "conclusionTag": "veras_holt_winny", "delivery": "skill-check" }
]
Cztery drogi do jednego wniosku — drużyna nie może go przeoczyć.`;

  const user = `${fewShot}

---

SZKIELET AKTÓW I FRONTÓW:
${JSON.stringify(input.skeleton, null, 2)}

LISTA SCEN:
${JSON.stringify(input.scenes, null, 2)}

BRIEF (parametry NPC/lokacji):
Ton: ${input.brief.tone}
Setting: ${input.brief.setting}
Poziom drużyny: ${input.brief.partyLevel}
Wielkość drużyny: ${input.brief.partySize}

Wyprodukuj ~${npcCountHint} NPC, ~${locationCountHint} lokacji, 6-15 tajemnic (z min. 3 conclusionTagami pokrytymi przez ≥3 tajemnice każdy), 2-6 zegarów.
Emituj JSON bez Markdown, bez komentarzy.`;

  return { system, user };
}
