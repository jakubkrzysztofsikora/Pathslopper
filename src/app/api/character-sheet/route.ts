import { NextRequest, NextResponse } from "next/server";
import {
  CharacterSheetVLMRequestSchema,
  CharacterSheetParsedSchema,
} from "@/lib/schemas/character-sheet";
import { buildCharacterSheetVLMPrompt } from "@/lib/prompts/character-sheet-vlm";
import { callLLM, type ChatMessage } from "@/lib/llm/client";
import { extractJsonBlock } from "@/lib/llm/structured-output";

// TODO: LangGraph node — wire this handler as a node in a character-processing graph.
// The node receives CharacterSheetVLMRequest and emits CharacterSheetParsed to downstream
// nodes (inventory normalizer, stat-block renderer, etc.).

const UPSTREAM_ERROR_MESSAGE = "Upstream model call failed.";

function logServerError(stage: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[character-sheet] ${stage} failed: ${message}`);
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const parsed = CharacterSheetVLMRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { imageBase64, mimeType, version } = parsed.data;
  const textPrompt = buildCharacterSheetVLMPrompt(version);

  // Scaleway Generative APIs accepts OpenAI-style vision content: a mixed
  // content array with a text part and an image_url part whose URL is a
  // data URI. The `multimodal: true` hint routes the request to the vision
  // default model (Pixtral 12B) unless LLM_VISION_MODEL overrides it.
  const messages: ChatMessage[] = [
    {
      role: "user",
      content: [
        { type: "text", text: textPrompt },
        {
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${imageBase64}` },
        },
      ],
    },
  ];

  let rawResponse: string;
  try {
    rawResponse = await callLLM({
      system: `You are a precise character sheet parser for ${version === "pf1e" ? "Pathfinder 1st Edition" : "Pathfinder 2nd Edition"}. Extract data accurately and return only valid JSON.`,
      messages,
      multimodal: true,
    });
  } catch (err) {
    logServerError("llm-call", err);
    return NextResponse.json(
      { ok: false, error: UPSTREAM_ERROR_MESSAGE },
      { status: 502 }
    );
  }

  // The VLM is instructed to return only JSON. extractJsonBlock now
  // handles both fenced and bare shapes (plus prose-prefixed bare JSON
  // via a balanced-brace heuristic), so we no longer need to pre-wrap
  // the response in a fence — that pre-wrap was fragile when the model
  // added conversational prose before the JSON.
  const extracted = extractJsonBlock(rawResponse, CharacterSheetParsedSchema);

  if (!extracted.ok || !extracted.data) {
    const warnings: string[] = [];
    if (extracted.error) warnings.push(extracted.error);
    return NextResponse.json(
      { ok: false, warnings, raw: extracted.raw },
      { status: 422 }
    );
  }

  const warnings: string[] = [];

  return NextResponse.json({ ok: true, data: extracted.data, warnings });
}
