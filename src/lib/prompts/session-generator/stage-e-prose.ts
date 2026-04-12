import { z } from "zod";
import type { SessionGraph } from "@/lib/schemas/session-graph";
import { POLISH_OUTPUT_CLAUSE } from "@/lib/prompts/system/gm-core";

export const STAGE_E_TEMPERATURE = 0.8;

export const StageEProseSchema = z.object({
  nodePrompts: z.record(z.string(), z.string().max(4000)),
});

export type StageEProse = z.infer<typeof StageEProseSchema>;

export interface StageEInput {
  assembledGraph: Omit<SessionGraph, "createdAt" | "updatedAt" | "validatedAt">;
}

export function buildStageEPrompt(input: StageEInput): { system: string; user: string } {
  const nodeIds = input.assembledGraph.nodes.map((n) => n.id);
  const npcIndex = Object.fromEntries(
    input.assembledGraph.npcs.map((n) => [n.id, `${n.name} (${n.role})`])
  );
  const locationIndex = Object.fromEntries(
    input.assembledGraph.locations.map((l) => [l.id, `${l.name}: ${l.aspects.slice(0, 2).join(", ")}`])
  );

  const system = `${POLISH_OUTPUT_CLAUSE}

Jesteś Mistrzem Gry piszącym tekst wejściowy dla Dyrektora narracyjnego sesji Pathfinder 2e. Dla każdego węzła grafu sesji piszesz "prompt" — ziarno narracji, które Dyrektor rozsieje w trakcie gry.

CZYM JEST PROMPT WĘZŁA:
- Żywy opis sytuacji w czasie teraźniejszym ("Drużyna wchodzi do...", "Strażnicy blokują wyjście...")
- Zawiera: atmosferę sensoryczną (wzrok, dźwięk, zapach), aktywnych NPC z ich motywacją, obstacle do pokonania, możliwe stawki
- NIE zawiera wyników ani rozstrzygnięć — to otwarcie sceny, nie jej zakończenie
- Max 4000 znaków na węzeł

STYL:
- Konkretny, sensoryczny, angażujący ("mokre kamienie, smród szczurów" — nie "ciemne lochowisko")
- Sugestywny, nie nakazowy — Dyrektor improwizuje na bazie tego ziarna
- Dla kind="ending": finalna narracja jako zamknięcie opowieści (koda)
- Dla kind="cutscene": autonarracja bez pytań do graczy
- Dla kind="combat-narrative" lub "combat-rolled": opis pola walki + taktycznych możliwości

ZNACZNIKI EMOCJI DLA NARRACJI GŁOSOWEJ:
- Wplataj znaczniki emocji w nawiasach kwadratowych PO ANGIELSKU (system TTS rozumie tylko angielskie tagi):
  [whispers], [softly], [angrily], [fearfully], [dramatic pause], [solemnly], [urgently], [sadly], [hopefully], [laughs], [sighs]
- Używaj oszczędnie: 1-3 na prompt, w kluczowych momentach dramatycznych
- Dla combat: [urgently], [angrily]
- Dla cutscene: więcej emocji — to scena filmowa
- Dla ending: [solemnly] lub [sadly] zależnie od kategorii
- Znaczniki zostaną usunięte z tekstu wyświetlanego graczowi, a przekazane do silnika głosu

NPC W SCENIE (name → role):
${Object.entries(npcIndex).map(([id, desc]) => `${id}: ${desc}`).join("\n")}

LOKACJE (id → nazwa i aspekty):
${Object.entries(locationIndex).map(([id, desc]) => `${id}: ${desc}`).join("\n")}

SCHEMA WYJŚCIA — obiekt gdzie klucz = nodeId, wartość = tekst prompta (max 4000 znaków):
{ "nodePrompts": { "nodeId1": "tekst...", "nodeId2": "tekst..." } }`;

  const user = `WĘZŁY DO OPISANIA:
${input.assembledGraph.nodes.map((n) => {
  const npcNames = n.npcsPresent
    .map((id) => npcIndex[id] ?? id)
    .join(", ");
  const locDesc = n.locationId ? (locationIndex[n.locationId] ?? n.locationId) : "";
  return `- ${n.id} [${n.kind}] akt${n.act}: "${n.title}" | Synopsis: ${n.synopsis}${npcNames ? ` | NPC: ${npcNames}` : ""}${locDesc ? ` | Lokacja: ${locDesc}` : ""}${n.objective ? ` | Cel: ${n.objective}` : ""}`;
}).join("\n")}

Wygeneruj nodePrompts dla KAŻDEGO z ${nodeIds.length} węzłów. Emituj JSON bez Markdown.`;

  return { system, user };
}
