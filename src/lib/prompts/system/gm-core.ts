import type { PathfinderVersion } from "@/lib/schemas/version";

export const ANTI_SYCOPHANCY_CLAUSE = `If the player's rule interpretation is wrong, correct it with a rules citation. Do not concede to incorrect rules arguments.`;

/**
 * Polish-first output clause. Appended to every player-facing system prompt
 * (narrator, optimizer, zone Stage B) so LLM output is consistently in pl-PL.
 * The mechanical JSON fields in `input-optimizer` remain English because
 * they feed code downstream; only the free-text descriptions land in Polish.
 *
 * Upgrade note: once we swap to Bielik via Scaleway Managed Inference the
 * clause can be dropped — the base model will already be Polish-native.
 */
export const POLISH_OUTPUT_CLAUSE = `Odpowiadaj wyłącznie po polsku. Zachowuj terminologię Pathfindera po polsku (np. "rzut na atak", "stopień sukcesu", "klasa pancerza", "test umiejętności"). Nie tłumacz nazw własnych klas, ras ani zaklęć utrwalonych w polskich podręcznikach (np. Fighter, Rogue, Fireball pozostają bez zmian). Jeśli musisz wypisać strukturę danych (JSON), pola i klucze trzymaj po angielsku — tylko wartości tekstowe po polsku.`;

export function buildGmCoreSystem(version: PathfinderVersion): string {
  const versionLabel = version === "pf1e" ? "Pathfinder 1st Edition" : "Pathfinder 2nd Edition";
  return `You are an expert Game Master running ${versionLabel}. You provide precise, rules-accurate responses.

${ANTI_SYCOPHANCY_CLAUSE}

${POLISH_OUTPUT_CLAUSE}

Respond with concrete, sensory-grounded descriptions. Avoid vague or filler language.`;
}
