import { NextRequest, NextResponse } from "next/server";
import {
  CharacterSheetVLMRequestSchema,
  CharacterSheetParsedSchema,
} from "@/lib/schemas/character-sheet";
import { buildCharacterSheetVLMPrompt } from "@/lib/prompts/character-sheet-vlm";
import { callClaude } from "@/lib/llm/anthropic-client";
import { extractJsonBlock } from "@/lib/llm/structured-output";
import type Anthropic from "@anthropic-ai/sdk";

// TODO: LangGraph node — wire this handler as a node in a character-processing graph.
// The node receives CharacterSheetVLMRequest and emits CharacterSheetParsed to downstream
// nodes (inventory normalizer, stat-block renderer, etc.).

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

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mimeType,
            data: imageBase64,
          },
        },
        {
          type: "text",
          text: textPrompt,
        },
      ],
    },
  ];

  let rawResponse: string;
  try {
    rawResponse = await callClaude({
      system: `You are a precise character sheet parser for ${version === "pf1e" ? "Pathfinder 1st Edition" : "Pathfinder 2nd Edition"}. Extract data accurately and return only valid JSON.`,
      messages,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error ? err.message : "Claude API call failed.",
      },
      { status: 502 }
    );
  }

  // The VLM is instructed to return only JSON; wrap in a fence for extractJsonBlock.
  const fencedResponse = rawResponse.trim().startsWith("```")
    ? rawResponse
    : "```json\n" + rawResponse + "\n```";

  const extracted = extractJsonBlock(fencedResponse, CharacterSheetParsedSchema);

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
