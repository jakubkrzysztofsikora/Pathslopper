export const DEFAULT_BANNED_PHRASES: string[] = [
  "moreover",
  "it's crucial to",
  "delve",
  "navigate the complexities",
  "tapestry",
  "in the realm of",
  "testament to",
];

/**
 * Scans text for banned phrases case-insensitively.
 * Returns the list of matched phrases found in the text.
 * Pure function — no side effects.
 */
export function scanBannedPhrases(text: string, extra: string[] = []): string[] {
  const phrases = [...DEFAULT_BANNED_PHRASES, ...extra];
  const lowered = text.toLowerCase();
  return phrases.filter((phrase) => lowered.includes(phrase.toLowerCase()));
}
