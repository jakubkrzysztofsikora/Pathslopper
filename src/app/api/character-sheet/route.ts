import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  CharacterSheetVLMRequestSchema,
  CharacterSheetParsedSchema,
} from "@/lib/schemas/character-sheet";
import { buildCharacterSheetVLMPrompt } from "@/lib/prompts/character-sheet-vlm";
import { callLLM, type ChatMessage } from "@/lib/llm/client";
import { extractJsonBlock } from "@/lib/llm/structured-output";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Client, getBucket } from "@/lib/storage/s3-client";

// Alternative request schema: objectKey path (uploaded via presigned PUT URL)
const ObjectKeyRequestSchema = z.object({
  objectKey: z
    .string()
    .regex(/^uploads\/[a-f0-9-]+\.\w{3,4}$/, "Invalid objectKey format"),
  version: z.enum(["pf1e", "pf2e"]),
});

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

  // Prefer the objectKey path (presigned PUT → GET flow); fall back to
  // legacy base64 path so existing clients keep working unchanged.
  const objectKeyParsed = ObjectKeyRequestSchema.safeParse(body);

  let version: "pf1e" | "pf2e";
  let imageContent: { type: "image_url"; image_url: { url: string } };

  if (objectKeyParsed.success) {
    version = objectKeyParsed.data.version;
    // Object Storage path: generate a short-lived GET URL for the VLM
    let readUrl: string;
    try {
      readUrl = await getSignedUrl(
        getS3Client(),
        new GetObjectCommand({
          Bucket: getBucket(),
          Key: objectKeyParsed.data.objectKey,
        }),
        { expiresIn: 300 }
      );
    } catch (err) {
      logServerError("presigned-get", err);
      return NextResponse.json(
        { ok: false, error: "Failed to generate read URL for uploaded image." },
        { status: 502 }
      );
    }
    imageContent = { type: "image_url", image_url: { url: readUrl } };
  } else {
    // Legacy base64 path
    const base64Parsed = CharacterSheetVLMRequestSchema.safeParse(body);
    if (!base64Parsed.success) {
      return NextResponse.json(
        { ok: false, error: base64Parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { imageBase64, mimeType } = base64Parsed.data;
    version = base64Parsed.data.version;
    imageContent = {
      type: "image_url",
      image_url: { url: `data:${mimeType};base64,${imageBase64}` },
    };
  }

  const textPrompt = buildCharacterSheetVLMPrompt(version);

  // Scaleway Generative APIs accepts OpenAI-style vision content: a mixed
  // content array with a text part and an image_url part whose URL is either
  // a data URI (legacy) or a presigned HTTPS URL (Object Storage path).
  // The `multimodal: true` hint routes the request to the vision default
  // model (Pixtral 12B) unless LLM_VISION_MODEL overrides it.
  const messages: ChatMessage[] = [
    {
      role: "user",
      content: [{ type: "text", text: textPrompt }, imageContent],
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
