import { z } from "zod";
import type { SessionBrief } from "@/lib/schemas/session-brief";
import { SessionEdgeSchema, EndingSchema } from "@/lib/schemas/session-graph";
import { POLISH_OUTPUT_CLAUSE } from "@/lib/prompts/system/gm-core";
import type { StageASkeleton } from "./stage-a-skeleton";
import type { StageBScenes } from "./stage-b-scenes";
import type { StageCWorldKit } from "./stage-c-worldkit";

export const STAGE_D_TEMPERATURE = 0.3;

export const StageDWiringSchema = z.object({
  edges: z.array(SessionEdgeSchema),
  endings: z.array(EndingSchema).min(2).max(5),
  startNodeId: z.string(),
});

export type StageDWiring = z.infer<typeof StageDWiringSchema>;

export interface StageDInput {
  brief: SessionBrief;
  skeleton: StageASkeleton;
  scenes: StageBScenes;
  worldKit: StageCWorldKit;
}

export function buildStageDPrompt(input: StageDInput): { system: string; user: string } {
  const sceneIds = input.scenes.scenes.map((s) => s.id);
  const strongStart = input.scenes.scenes.find((s) => s.kind === "strong-start");
  const endingScenes = input.scenes.scenes.filter((s) => s.kind === "ending");
  const clockIds = input.worldKit.clocks.map((c) => c.id);

  const system = `${POLISH_OUTPUT_CLAUSE}

Jesteś architektem sterowania przepływem sesji Pathfinder 2e. Masz listę scen, rekwizytorium i szkielet — teraz musisz je połączyć krawędziami grafu.

Twój cel: emitować wyłącznie strukturę sterowania (edges + endings + startNodeId). Nie piszesz narracji.

TOPOLOGIA BRANCH-AND-BOTTLENECK:
- Graf ma topologię "rozgałęzienie i zwężenie": wiele równoległych ścieżek (branches) łączy się w węzłach decyzyjnych (bottlenecks) i z powrotem
- Bottleneck: scena hubowa lub kulminacyjna do której prowadzą co najmniej 2 różne ścieżki
- Każda scena musi być osiągalna z startNode (brak osieroconych węzłów)
- Sceny ending są terminalne — nie mają krawędzi wychodzących

TYPY KRAWĘDZI:
- "choice": wybór gracza — wymagany label w języku polskim
- "auto": automatyczne przejście po wejściu w scenę
- "fallback": zapasowe wyjście jeśli żadna inna krawędź nie jest aktywna
- "clock-trigger": wyzwolone przez wypełnienie zegara — wymagane clockId z listy: ${clockIds.join(", ")}

EFFECTS NA KRAWĘDZIACH:
- set-flag: ustaw flagę narracyjną (np. "poznano_prawde_o_holcie")
- tick-clock: wypełnij zegar (clockId z listy powyżej) o segments (1-3)
- reveal-secret: ujawnij tajemnicę (secretId z rekwizytoriom)
- fire-portent: aktywuj grim portent frontu

ZASADY ENDING:
- Endings z kategorią klęski/TPK SĄ OBOWIĄZKOWE — sesja musi być przerywalna
- Każdy ending węzeł ze Stage B musi mieć odpowiadający wpis w tablicy endings
- condition w ending opisuje warunek dotarcia do węzła (najczęściej flag-set lub clock-filled)

DOZWOLONE IDs SCEN: ${sceneIds.join(", ")}
startNodeId MUSI być: ${strongStart?.id ?? sceneIds[0]}

SCHEMA WYJŚCIA:
{
  "startNodeId": string,
  "edges": [{
    "id": string,           // unikalny, snake_case
    "from": string,         // nodeId ze scen
    "to": string,           // nodeId ze scen
    "kind": "choice|auto|fallback|clock-trigger",
    "label": string,        // wymagany dla kind="choice"
    "condition": Predicate, // opcjonalne
    "onTraverseEffects": Effect[],
    "clockId": string,      // wymagany dla kind="clock-trigger"
    "priority": number
  }],
  "endings": [{
    "id": string,
    "nodeId": string,       // musi być z listy ending-kind scen
    "condition": Predicate,
    "title": string,
    "summary": string,
    "frontResolutions": [{ "frontId": string, "outcome": string }],
    "category": "victory|partial-victory|pyrrhic|defeat|tpk"
  }]
}`;

  const user = `SCENY (IDs i kindy):
${input.scenes.scenes.map((s) => `${s.id} [${s.kind}] akt${s.act}`).join("\n")}

ZEGARY:
${input.worldKit.clocks.map((c) => `${c.id}: "${c.label}" (${c.segments} seg, ${c.polarity})`).join("\n")}

FRONTY:
${input.skeleton.fronts.map((f) => `${f.name}`).join("\n")}

ENDING SCENY (${endingScenes.map((s) => s.id).join(", ")}) — muszą mieć wpisy w tablicy endings, w tym CO NAJMNIEJ JEDEN z category="defeat" lub "tpk".

BRIEF:
Ton: ${input.brief.tone}
Poziom drużyny: ${input.brief.partyLevel}

Emituj JSON bez Markdown. Każda scena musi być osiągalna z startNodeId.`;

  return { system, user };
}
