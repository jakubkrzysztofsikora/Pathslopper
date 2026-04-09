/**
 * LLM client for Pathfinder Nexus.
 *
 * Talks to Scaleway Generative APIs via its OpenAI-compatible REST endpoint.
 * A thin fetch wrapper, no SDK — we don't need streaming or tool use yet
 * and adding the full `openai` package would bring tree-shake baggage for
 * the two shapes we actually use (text chat, multimodal text+image).
 *
 * Authentication is a single Scaleway IAM API key minted by Terraform for
 * the "pathfinder-nexus-llm-{env}" IAM application and scoped to the
 * GenerativeApisFullAccess permission set. The key is stored in Scaleway
 * Secret Manager and injected into the Serverless Container at cold-start
 * as LLM_API_KEY. The base URL and default models are env-var driven so
 * ops can swap in a Scaleway Managed Inference endpoint (e.g., a self-
 * hosted Bielik for Polish-first reasoning) without a code deploy.
 *
 * Env vars consumed at runtime:
 *   LLM_API_KEY         — Scaleway API key with generative-api permission
 *   LLM_BASE_URL        — default https://api.scaleway.ai/v1
 *   LLM_TEXT_MODEL      — default llama-3.1-70b-instruct
 *   LLM_VISION_MODEL    — default pixtral-12b-2409
 */

export interface TextContentPart {
  type: "text";
  text: string;
}

export interface ImageContentPart {
  type: "image_url";
  image_url: { url: string };
}

export type ChatContentPart = TextContentPart | ImageContentPart;

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | ChatContentPart[];
}

export interface CallLLMOptions {
  system: string;
  messages: ChatMessage[];
  /** Override the default text model. */
  model?: string;
  /** Hint that the messages contain images — the default vision model is used unless `model` is set. */
  multimodal?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export type CallLLM = (opts: CallLLMOptions) => Promise<string>;

const DEFAULT_BASE_URL = "https://api.scaleway.ai/v1";
const DEFAULT_TEXT_MODEL = "llama-3.1-70b-instruct";
const DEFAULT_VISION_MODEL = "pixtral-12b-2409";

function resolveModel(opts: CallLLMOptions): string {
  if (opts.model) return opts.model;
  if (opts.multimodal) {
    return process.env.LLM_VISION_MODEL ?? DEFAULT_VISION_MODEL;
  }
  return process.env.LLM_TEXT_MODEL ?? DEFAULT_TEXT_MODEL;
}

function resolveBaseUrl(): string {
  return process.env.LLM_BASE_URL ?? DEFAULT_BASE_URL;
}

function resolveApiKey(): string {
  const key = process.env.LLM_API_KEY;
  if (!key) {
    throw new Error(
      "LLM_API_KEY environment variable is not set. Terraform provisions this via the scaleway_iam_api_key resource and injects it through secret_environment_variables."
    );
  }
  return key;
}

interface OpenAIChatResponse {
  choices?: Array<{
    message?: { content?: string | ChatContentPart[] };
  }>;
  error?: { message?: string; type?: string };
}

/**
 * Single-shot chat completion. Prepends the system prompt as a role=system
 * message (OpenAI convention) and returns the first text chunk from the
 * assistant's response.
 */
export async function callLLM(opts: CallLLMOptions): Promise<string> {
  const url = `${resolveBaseUrl().replace(/\/+$/, "")}/chat/completions`;
  const apiKey = resolveApiKey();
  const model = resolveModel(opts);

  const body = {
    model,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.7,
    messages: [
      { role: "system" as const, content: opts.system },
      ...opts.messages,
    ],
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `Scaleway Generative APIs network error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Scaleway Generative APIs returned ${res.status}: ${text.slice(0, 300)}`
    );
  }

  let json: OpenAIChatResponse;
  try {
    json = (await res.json()) as OpenAIChatResponse;
  } catch (err) {
    throw new Error(
      `Could not parse LLM response JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (json.error) {
    throw new Error(`LLM API error: ${json.error.message ?? "unknown"}`);
  }

  const content = json.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p): p is TextContentPart => p.type === "text")
      .map((p) => p.text)
      .join("");
  }
  throw new Error("LLM response contained no text content.");
}
