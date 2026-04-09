import type { ZodType, ZodTypeDef } from "zod";

export interface ExtractJsonBlockResult<T> {
  ok: boolean;
  data?: T;
  raw?: string;
  error?: string;
}

/**
 * Extracts JSON from a model response and validates it against a Zod
 * schema. Handles two shapes so upstream callers do not have to
 * pre-process the response:
 *
 * 1. A fenced ```json ... ``` block. If multiple fences are present,
 *    the LAST one is used — this matches Stage B's contract ("JSON
 *    block must appear at the end of your response") and avoids false
 *    matches on inline example fences earlier in the narration.
 * 2. A bare JSON object or array when the model emitted structured
 *    output without a fence. VLMs often prepend conversational prose
 *    like "Here's the parsed sheet:" before the JSON, so we also try
 *    to locate a top-level `{...}` or `[...]` span in the text.
 *
 * Returns a tagged error when neither shape yields valid JSON / schema.
 */
export function extractJsonBlock<T>(
  markdown: string,
  schema: ZodType<T, ZodTypeDef, unknown>
): ExtractJsonBlockResult<T> {
  const fenceRegex = /```json\s*([\s\S]*?)```/gi;
  const fenceMatches = Array.from(markdown.matchAll(fenceRegex));
  const lastFence = fenceMatches[fenceMatches.length - 1];

  const candidates: string[] = [];
  if (lastFence && lastFence[1]) {
    candidates.push(lastFence[1].trim());
  } else {
    // No fence: try the whole trimmed text, and also a best-effort
    // substring from the first { or [ to the matching end. This
    // handles "Here's the JSON: {...}" style VLM responses without
    // forcing callers to wrap the content.
    const trimmed = markdown.trim();
    if (trimmed.length > 0) candidates.push(trimmed);
    const bareSpan = findBareJsonSpan(markdown);
    if (bareSpan && bareSpan !== trimmed) candidates.push(bareSpan);
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      error: "No JSON content found (neither a fenced block nor a bare object).",
    };
  }

  let lastError: string | undefined;
  let lastRaw: string | undefined;

  for (const raw of candidates) {
    lastRaw = raw;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      lastError = `JSON parse error: ${err instanceof Error ? err.message : String(err)}`;
      continue;
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      lastError = `Schema validation error: ${result.error.message}`;
      continue;
    }
    return { ok: true, data: result.data, raw };
  }

  return { ok: false, raw: lastRaw, error: lastError ?? "Unknown parse error." };
}

/**
 * Heuristic: find the first balanced `{...}` or `[...]` span in the
 * text, respecting string literals. Returns the span or undefined if
 * no balanced structure is found. This is intentionally simple — it
 * is a fallback for VLM responses that frame JSON with conversational
 * prose, not a full parser.
 */
function findBareJsonSpan(text: string): string | undefined {
  const openIdx = text.search(/[{[]/);
  if (openIdx < 0) return undefined;
  const opener = text[openIdx];
  const closer = opener === "{" ? "}" : "]";

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === opener) depth++;
    else if (ch === closer) {
      depth--;
      if (depth === 0) return text.slice(openIdx, i + 1);
    }
  }
  return undefined;
}
