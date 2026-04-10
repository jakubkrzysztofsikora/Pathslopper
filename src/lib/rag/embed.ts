/**
 * Embedding client for SRD RAG retrieval.
 *
 * Uses the same Scaleway Generative APIs endpoint as callLLM but calls the
 * /embeddings route (OpenAI-compatible).  Env vars consumed:
 *   LLM_API_KEY           — same Scaleway IAM key as text/vision routes
 *   LLM_BASE_URL          — default https://api.scaleway.ai/v1
 *   LLM_EMBEDDING_MODEL   — default bge-multilingual-gemma2
 *
 * Dependency direction: rag/ → llm/ (env var pattern only, no import of callLLM)
 */

const DEFAULT_BASE_URL = "https://api.scaleway.ai/v1";
const DEFAULT_EMBEDDING_MODEL = "bge-multilingual-gemma2";

export interface EmbedOptions {
  model?: string;
}

interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
  error?: { message?: string };
}

const RETRY_STATUS_CODES = new Set([429, 503]);
const RETRY_DELAYS_MS = [1000, 2000, 4000];

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Embed a batch of texts via the Scaleway /embeddings endpoint.
 * Returns one embedding vector per input text, preserving order.
 * Retries 3 times with exponential backoff on 429/503 responses.
 */
export async function embedTexts(
  texts: string[],
  opts?: EmbedOptions
): Promise<number[][]> {
  const baseUrl = (process.env.LLM_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = opts?.model ?? (process.env.LLM_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL);
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error(
      "LLM_API_KEY environment variable is not set. Required for embedding requests."
    );
  }

  const url = `${baseUrl}/embeddings`;
  const body = JSON.stringify({ input: texts, model });

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw new Error(
        `Embedding request network error: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (RETRY_STATUS_CODES.has(res.status) && attempt < RETRY_DELAYS_MS.length) {
      lastError = new Error(`Embedding API returned ${res.status} (rate limit / service unavailable).`);
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Embedding API returned ${res.status}: ${text.slice(0, 300)}`);
    }

    let json: OpenAIEmbeddingResponse;
    try {
      json = (await res.json()) as OpenAIEmbeddingResponse;
    } catch (err) {
      throw new Error(
        `Could not parse embedding response JSON: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (json.error) {
      throw new Error(`Embedding API error: ${json.error.message ?? "unknown"}`);
    }

    if (!json.data || json.data.length !== texts.length) {
      throw new Error(
        `Embedding response data length mismatch: expected ${texts.length}, got ${json.data?.length ?? 0}.`
      );
    }

    // Sort by index to ensure order matches input.
    const sorted = [...json.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return sorted.map((item, i) => {
      if (!item.embedding) {
        throw new Error(`Missing embedding for input at index ${i}.`);
      }
      return item.embedding;
    });
  }

  throw lastError ?? new Error("Embedding request failed after retries.");
}
