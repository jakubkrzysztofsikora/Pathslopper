import { z, type ZodObject, type ZodRawShape } from "zod";
import type { ImportedSections } from "./markdown-parser";

/**
 * Extract-or-fill mode: the LLM treats the user's imported notes as authoritative
 * source material. It EXTRACTS whatever the user already wrote and only INVENTS
 * what is missing. Every invented field is reported in `synthesizedPaths` so the
 * editor UI can flag it for GM review.
 */
export const EXTRACT_OR_FILL_PREFIX_PL = `TRYB IMPORTU (extract-or-fill)
-----------------------------------
Otrzymałeś notatki sesyjne pisane wcześniej przez Mistrza Gry. Twoim zadaniem nie jest tworzenie sesji od zera, lecz:

1. EKSTRAKCJA: Wszystkie fakty, nazwy własne, dialogi, opisy lokacji i postacie z notatek użytkownika trafiają do odpowiednich pól BEZ parafrazy. Nazwy własne (imiona NPC, nazwy miejsc, nazwy artefaktów) zachowujesz znak po znaku.
2. UZUPEŁNIANIE: Tylko jeżeli pole jest wymagane przez schemat, a notatki go NIE zawierają, wolno Ci je wymyślić. Minimalizuj inwencję.
3. RAPORTOWANIE: Każde pole, które wymyśliłeś (nie pochodzi z notatek), umieszczasz w polu \`synthesizedPaths\` w formacie { "<id encji>": ["<ścieżka pola>", ...] }. Jeżeli cała encja jest wymyślona, użyj wartości ["*"].
4. REGUŁA TRZECH WSKAZÓWEK: Jeżeli conclusionTag ma mniej niż 3 tajemnice w notatkach, MUSISZ dorobić brakujące tajemnice i oznaczyć je w synthesizedPaths — nigdy nie zostawiaj tagu z <3 wskazówek.
5. STAT BLOKI PF2e (tylko Stage F): nigdy nie ufaj stat blokom z notatek użytkownika. Generuj zgodnie z GMG Table 2-5 dla \`partyLevel\`. Wszystkie stat bloki zawsze trafiają do synthesizedPaths.

Pole synthesizedPaths JEST WYMAGANE w każdej odpowiedzi (może być pustym obiektem {} gdy wszystko wyekstrahowano bez wymysłu).
-----------------------------------`;

/**
 * Extends any stage-response Zod object with a required `synthesizedPaths`
 * channel so the LLM reports which fields it invented. `synthesizedPaths` is
 * `Record<entityId, string[]>` where each string is a dot-delimited field
 * path relative to that entity, or `"*"` for a fully-synthesised entity.
 */
export function extendWithSynthesizedPaths<Shape extends ZodRawShape>(
  base: ZodObject<Shape>
) {
  return base.extend({
    synthesizedPaths: z.record(z.string(), z.array(z.string())),
  });
}

export interface SynthesizedPathsPayload {
  synthesizedPaths: Record<string, string[]>;
}

/**
 * Serialise ImportedSections into a human-readable Polish block embedded in
 * the user prompt. The LLM reads this as "what the user already wrote" and
 * uses it to decide which fields it can extract vs. must invent.
 */
export function formatImportedSections(sections: ImportedSections): string {
  const parts: string[] = ["NOTATKI UŻYTKOWNIKA (źródło — nie parafrazuj nazw własnych)"];
  parts.push("===================================================================");

  if (sections.title) {
    parts.push(`TYTUŁ: ${sections.title}`);
  }
  if (sections.lede) {
    parts.push(`LEDE: ${sections.lede}`);
  }

  parts.push(section("STRONG START", sections.strongStart ?? "brak"));
  parts.push(section("SCENY", renderListItems(sections.scenes)));
  parts.push(section("SEKRETY I TROPY", renderStrings(sections.secrets)));
  parts.push(section("LOKACJE", renderListItems(sections.locations)));
  parts.push(section("BNi / NPC", renderListItems(sections.npcs)));
  parts.push(section("POTWORY / PRZECIWNICY", renderListItems(sections.monsters)));
  parts.push(section("SKARBY / NAGRODY", renderStrings(sections.treasure)));
  parts.push(section("ZEGARY", renderListItems(sections.clocks)));
  parts.push(section("FRONTY", renderListItems(sections.fronts)));
  parts.push(section("ZAKOŃCZENIA", renderListItems(sections.endings)));

  if (sections.unclassified.length > 0) {
    parts.push("");
    parts.push("NIESKLASYFIKOWANE FRAGMENTY (salvage: przypisz do odpowiednich pól):");
    for (const u of sections.unclassified) {
      parts.push(`- [${u.heading}] ${truncate(u.body, 600)}`);
    }
  }

  return parts.join("\n");
}

function section(label: string, body: string): string {
  return `\n— ${label} —\n${body.trim() || "brak"}`;
}

function renderListItems(items: { name: string; body: string }[]): string {
  if (items.length === 0) return "brak";
  return items.map((i) => `- ${i.name}: ${truncate(i.body, 400)}`).join("\n");
}

function renderStrings(items: string[]): string {
  if (items.length === 0) return "brak";
  return items.map((s) => `- ${truncate(s, 400)}`).join("\n");
}

function truncate(s: string, n: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}
