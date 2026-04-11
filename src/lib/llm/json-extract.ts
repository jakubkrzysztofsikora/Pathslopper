/**
 * Lightweight JSON extraction helper for LLM response strings.
 *
 * Handles the three common shapes LLMs emit:
 *  1. A bare JSON object or array (most well-behaved models).
 *  2. JSON wrapped in a ```json ... ``` code fence.
 *  3. A JSON object embedded somewhere in prose (heuristic fallback).
 *
 * Returns the first parseable JSON string extracted from `raw`, or
 * null if no valid JSON is found. Does NOT validate against a schema —
 * callers are responsible for parsing and validating the returned string.
 *
 * This helper was extracted from generate-session.ts (runStageWithRetry)
 * and the equivalent extraction path in generate-zone.ts (stage B verifier)
 * to eliminate duplication across the two orchestrators.
 */
export function extractJsonBlock(raw: string): string | null {
  const trimmed = raw.trim();

  // 1. Bare JSON — most reliable; try first.
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // fall through
  }

  // 2. Fenced ```json ... ``` or ``` ... ``` block.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    const candidate = fenceMatch[1].trim();
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // fall through
    }
  }

  // 3. Heuristic: find the first top-level `{...}` span in the text.
  //    Handles "Here's the JSON: {...}" style model responses.
  const objMatch = trimmed.match(/(\{[\s\S]*\})/);
  if (objMatch) {
    const candidate = objMatch[1];
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // fall through
    }
  }

  return null;
}
