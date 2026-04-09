import type { ZodType, ZodTypeDef } from "zod";

export interface ExtractJsonBlockResult<T> {
  ok: boolean;
  data?: T;
  raw?: string;
  error?: string;
}

/**
 * Extracts a fenced ```json ... ``` block from markdown text,
 * parses it, and validates it against the provided Zod schema.
 */
export function extractJsonBlock<T>(
  markdown: string,
  schema: ZodType<T, ZodTypeDef, unknown>
): ExtractJsonBlockResult<T> {
  const fenceRegex = /```json\s*([\s\S]*?)```/i;
  const match = fenceRegex.exec(markdown);

  if (!match || !match[1]) {
    return {
      ok: false,
      error: "No ```json fenced block found in the provided text.",
    };
  }

  const raw = match[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      raw,
      error: `JSON parse error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const result = schema.safeParse(parsed);

  if (!result.success) {
    return {
      ok: false,
      raw,
      error: `Schema validation error: ${result.error.message}`,
    };
  }

  return {
    ok: true,
    data: result.data,
    raw,
  };
}
