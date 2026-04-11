import { z } from "zod";
import type { SessionBrief } from "@/lib/schemas/session-brief";
import { POLISH_OUTPUT_CLAUSE } from "@/lib/prompts/system/gm-core";

export const STAGE_A_TEMPERATURE = 0.9;

export const StageASkeletonSchema = z.object({
  acts: z
    .array(
      z.object({
        title: z.string().max(120),
        stakes: z.string().max(400),
      })
    )
    .min(1)
    .max(3),
  fronts: z
    .array(
      z.object({
        name: z.string().max(120),
        dangers: z
          .array(
            z.object({
              name: z.string(),
              impulse: z.string(),
            })
          )
          .min(1)
          .max(5),
        grimPortents: z.array(z.string()).min(3).max(5),
        impendingDoom: z.string().max(400),
        stakes: z.array(z.string()).min(1).max(5),
      })
    )
    .min(1)
    .max(4),
  primaryConflict: z.string().max(400),
});

export type StageASkeleton = z.infer<typeof StageASkeletonSchema>;

export function buildStageAPrompt(input: SessionBrief): { system: string; user: string } {
  const safetyBlock =
    input.safetyTools.lines.length > 0
      ? `\nBEZWZGLĘDNIE ZAKAZANE TEMATY (Lines): ${input.safetyTools.lines.join(", ")}. Nie pojawiają się w żadnej formie.`
      : "";
  const veilsBlock =
    input.safetyTools.veils.length > 0
      ? `\nTEMATY ZANIKAJĄCE (Veils): ${input.safetyTools.veils.join(", ")}. Mogą istnieć w świecie, ale scena przechodzi w zaciemnienie (fade to black) zanim zostaną pokazane na ekranie.`
      : "";

  const system = `${POLISH_OUTPUT_CLAUSE}

Jesteś doświadczonym Mistrzem Gry Pathfinder 2e. Przygotowujesz szkielet narracyjny sesji w stylu Leniwego Mistrza Gry (Sly Flourish): minimum przygotowania, maksimum dramatyzmu. Myślisz strukturą Dungeon World Fronts: każde zagrożenie ma własne życie, dąży do celu i zostawia ślady w świecie.

Twoje zadanie: na podstawie briefu sesji wygenerować JSON ze strukturą aktów i frontów. Nie piszesz prozy — piszesz architekturę dramatyczną.

ZASADY FRONTÓW (Dungeon World):
- Front = niezależny aktor lub siła, która działa BEZ drużyny
- grimPortents = ordered list 3-5 eskalacji (od złego do katastrofalnego). Każdy portent to jedno zdanie w czasie teraźniejszym opisujące widoczny skutek w świecie
- impendingDoom = co się stanie, jeśli drużyna w ogóle nie zareaguje
- dangers = podmioty lub mechanizmy wewnątrz frontu, każdy z impulse opisującym co chce osiągnąć
- stakes = pytania dramatyczne bez odpowiedzi (np. "Czy Elara zdradzi brata dla władzy?")
${safetyBlock}${veilsBlock}

Emituj WYŁĄCZNIE JSON pasujący do poniższego schematu — bez Markdown, bez komentarzy:
{
  "acts": [{ "title": string, "stakes": string }],       // 1-3 aktów
  "fronts": [{                                            // 1-4 frontów
    "name": string,
    "dangers": [{ "name": string, "impulse": string }],  // 1-5
    "grimPortents": [string, string, string],             // min 3, max 5
    "impendingDoom": string,
    "stakes": [string]                                    // 1-5 pytań
  }],
  "primaryConflict": string                              // jedno zdanie — sedno konfliktu sesji
}`;

  const fewShot = `PRZYKŁAD WEJŚCIA:
{
  "tone": "mroczny intrygancki",
  "setting": "Korporacja handlowa kontroluje miasto portowe; syndykat przemytników szantażuje rajców",
  "targetDurationHours": 4,
  "partyLevel": 5
}

PRZYKŁAD WYJŚCIA:
{
  "acts": [
    { "title": "Kontakt w cieniu", "stakes": "Drużyna dowiaduje się, jak głęboko sięga korupcja." },
    { "title": "Serce Korporacji", "stakes": "Dokumenty lub krew — jedno musi zginąć." },
    { "title": "Płomień rachunku", "stakes": "Czy miasto zostanie wyzwolone, czy pochłonięte?" }
  ],
  "fronts": [
    {
      "name": "Kompania Żelaznego Brzegu",
      "dangers": [
        { "name": "Dyrektor Veras Holt", "impulse": "Kontrolować każdy kontrakt w porcie, eliminować świadków" },
        { "name": "Straż Portowa na żołdzie", "impulse": "Tłumić niepokoje bez zostawiania śladów" }
      ],
      "grimPortents": [
        "Trzeci świadek w tygodniu 'topi się' w porcie",
        "Korporacja kupuje magistrat — rajcy przestają odpowiadać na wezwania",
        "Patrolowce blokują ujście rzeki; żadna łódź nie wychodzi bez rewizji"
      ],
      "impendingDoom": "Miasto staje się prywatnym lennem korporacji; każdy handel wymaga licencji płatnej krwią.",
      "stakes": ["Czy ktokolwiek w radzie jest jeszcze uczciwy?", "Ile jest wart jeden człowiek wobec portowego monopolu?"]
    }
  ],
  "primaryConflict": "Drużyna musi zniszczyć korporacyjną machinę korupcji, zanim miasto stanie się jej zakładnikiem."
}`;

  const user = `${fewShot}

---

BRIEF SESJI DO PRZETWORZENIA:
${JSON.stringify(input, null, 2)}

Emituj JSON. Żadnego Markdown, żadnego tekstu poza JSON.`;

  return { system, user };
}
