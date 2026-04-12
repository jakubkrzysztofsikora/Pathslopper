export const DEFAULT_BANNED_PHRASES: string[] = [
  // English LLM-isms
  "moreover",
  "it's crucial to",
  "delve",
  "navigate the complexities",
  "tapestry",
  "in the realm of",
  "testament to",
  // Polish LLM fabrications
  "walczenie",
  "kradnienie",
  "ogniomiotacz",
  "złodziejnik",
];

/**
 * Escapes a string so it can be safely embedded in a RegExp pattern.
 * Required because `extra` entries can come from user-supplied
 * `dna.tags.exclude` and may contain regex metacharacters.
 */
function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Scans text for banned phrases, matching on word boundaries so that
 * "delve" does not match inside "delver" and "tapestry" does not match
 * inside proper nouns. Case-insensitive. Pure function — no side effects.
 */
export function scanBannedPhrases(text: string, extra: string[] = []): string[] {
  const phrases = [...DEFAULT_BANNED_PHRASES, ...extra];
  const seen = new Set<string>();
  const hits: string[] = [];
  for (const phrase of phrases) {
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const pattern = new RegExp(`\\b${escapeRegex(phrase)}\\b`, "i");
    if (pattern.test(text)) hits.push(phrase);
  }
  return hits;
}
