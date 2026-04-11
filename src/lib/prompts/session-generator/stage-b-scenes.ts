import { z } from "zod";
import type { SessionBrief } from "@/lib/schemas/session-brief";
import { NodeKindSchema } from "@/lib/schemas/session-graph";
import { POLISH_OUTPUT_CLAUSE } from "@/lib/prompts/system/gm-core";
import type { StageASkeleton } from "./stage-a-skeleton";

export const STAGE_B_TEMPERATURE = 0.7;

export const StageBScenesSchema = z.object({
  scenes: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().max(120),
        synopsis: z.string().max(400),
        kind: NodeKindSchema,
        act: z.number().int().min(1).max(3),
        tensionLevel: z.number().min(0).max(10),
        estimatedMinutes: z.number().int().min(1).max(90),
        npcsPresent: z.array(z.string()).default([]),
        locationRef: z.string().optional(),
      })
    )
    .min(8)
    .max(40),
});

export type StageBScenes = z.infer<typeof StageBScenesSchema>;

export interface StageBInput {
  brief: SessionBrief;
  skeleton: StageASkeleton;
}

export function buildStageBPrompt(input: StageBInput): { system: string; user: string } {
  const targetScenes = Math.max(8, Math.min(30, input.brief.targetDurationHours * 3));
  const safetyBlock =
    input.brief.safetyTools.lines.length > 0
      ? `\nLines (bezwzględnie unikaj): ${input.brief.safetyTools.lines.join(", ")}`
      : "";

  const system = `${POLISH_OUTPUT_CLAUSE}

Jesteś Mistrzem Gry przygotowującym listę scen do sesji Pathfinder 2e. Pracujesz ze szkieletem aktów i frontów. Twój cel: stworzyć listę ${targetScenes} scen (+/- 2) rozłożonych na akty, zróżnicowanych pod względem napięcia i rodzaju.

REGUŁY KOMPOZYCJI:
- DOKŁADNIE JEDNA scena z kind="strong-start" — pierwsza scena całej sesji. Silny start to in medias res: akcja już trwa, decyzja jest wymagana natychmiast
- CO NAJMNIEJ DWIE sceny z kind="ending": jedna z kategorią zwycięstwa (w tytule zawierającą słowo "Zwycięstwo" lub "Tryumf"), jedna z kategorią klęski (zawierającą "Klęska", "Upadek" lub "Katastrofa")
- Napięcie (tensionLevel 0-10) rośnie wewnątrz aktów; akt 3 zawiera wyłącznie sceny o napięciu ≥7
- Każda scena ma unikalny id w snake_case odpowiadający treści, np. "akt1_mroczny_rynek"
- estimatedMinutes: strong-start=15, zwykła scena=20, combat-narrative=20, combat-rolled=45 (pełna inicjatywa + strike economy), exploration=25, ending=10
- Sceny hubów (kind="hub") grupują wybory fabularne bez własnej akcji — max 2 na sesję
- Zróżnicuj kindy: oprócz "scene" i "ending" użyj przynajmniej combat-narrative lub combat-rolled, exploration, cutscene
- npcsPresent: używaj nazw NPC które pojawiają się w szkielecie frontów/niebezpieczeństw (jeśli są wymienione)
- locationRef: opcjonalna wskazówka lokalizacji dla Stage C (np. "port", "ratusz", "las")
${safetyBlock}

SCHEMA WYJŚCIA:
{
  "scenes": [{
    "id": string,           // snake_case, unikalny
    "title": string,        // max 120 znaków
    "synopsis": string,     // 1 zdanie GM-owski brief, max 400 znaków
    "kind": NodeKind,       // strong-start|scene|hub|cutscene|combat-narrative|combat-rolled|exploration|ending
    "act": number,          // 1, 2 lub 3
    "tensionLevel": number, // 0-10
    "estimatedMinutes": number,
    "npcsPresent": string[],
    "locationRef": string   // opcjonalne
  }]
}`;

  const fewShot = `PRZYKŁAD (fragment — 3 sceny z 3-aktowej sesji intryg):
{
  "scenes": [
    {
      "id": "akt1_portowy_poscig",
      "title": "Mocny start: Pościg w portowych zaułkach",
      "synopsis": "Drużyna jest ścigana przez żołdaków korporacji; musi uciec LUB walczyć zanim wysłannicy zamkną uliczkę.",
      "kind": "strong-start",
      "act": 1,
      "tensionLevel": 8,
      "estimatedMinutes": 15,
      "npcsPresent": ["Kapitan Straży Marela"],
      "locationRef": "port_dolny"
    },
    {
      "id": "akt1_informator_taverna",
      "title": "Tajny informator w tawernie",
      "synopsis": "Stary urzędnik zna plan ksiąg rachunkowych, ale żąda ochrony dla swojej rodziny.",
      "kind": "scene",
      "act": 1,
      "tensionLevel": 4,
      "estimatedMinutes": 20,
      "npcsPresent": ["Uruk Pisarz"],
      "locationRef": "tawerna_kotwica"
    },
    {
      "id": "akt3_klęska_miasto_plonie",
      "title": "Klęska: Port w ogniu",
      "synopsis": "Korporacja wyzwoliła machinę wojenną — miasto płonie, drużyna uciekła z niczym.",
      "kind": "ending",
      "act": 3,
      "tensionLevel": 10,
      "estimatedMinutes": 10,
      "npcsPresent": [],
      "locationRef": "port_dolny"
    }
  ]
}`;

  const user = `${fewShot}

---

SZKIELET AKTÓW I FRONTÓW:
${JSON.stringify(input.skeleton, null, 2)}

BRIEF SESJI (ton, setting, długość):
Ton: ${input.brief.tone}
Setting: ${input.brief.setting}
Czas sesji: ${input.brief.targetDurationHours}h → cel ${targetScenes} scen
Poziom drużyny: ${input.brief.partyLevel}
Wielkość drużyny: ${input.brief.partySize}

Wygeneruj DOKŁADNIE ${targetScenes} scen (+/- 2). Emituj JSON bez Markdown.`;

  return { system, user };
}
