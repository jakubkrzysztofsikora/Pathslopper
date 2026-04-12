import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const RequestSchema = z.object({
  text: z.string().min(1).max(5000),
});

// POST /api/tts
// Proxies text-to-speech requests to ElevenLabs, keeping the API key server-side.
// Returns audio/mpeg stream. Returns 503 if TTS is not configured.
export async function POST(request: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "TTS not configured" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "P2244jTXPnenPJjaAnTC";
  const modelId = process.env.ELEVENLABS_MODEL_ID ?? "eleven_v3";

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: parsed.data.text,
          model_id: modelId,
          voice_settings: { stability: 0.6, similarity_boost: 0.8 },
        }),
      }
    );

    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => "Unknown error");
      console.error(`[tts] ElevenLabs error ${res.status}: ${errText}`);
      return NextResponse.json(
        { ok: false, error: "TTS generation failed" },
        { status: 502 }
      );
    }

    return new Response(res.body, {
      headers: {
        "Content-Type": "audio/mpeg",
      },
    });
  } catch (err) {
    console.error("[tts] fetch error:", err);
    return NextResponse.json(
      { ok: false, error: "TTS service unreachable" },
      { status: 502 }
    );
  }
}
