import { NextRequest, NextResponse } from "next/server";
import { SessionIdSchema } from "@/lib/schemas/session";
import { getSessionStore } from "@/lib/state/server/store-factory";
import { callLLM } from "@/lib/llm/client";
import { z } from "zod";

// POST /api/sessions/[id]/nodes/[nodeId]/regenerate
// Regenerates a single node's prompt field via LLM.

const NodeIdSchema = z.string().min(1).max(120);

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string; nodeId: string } }
) {
  const idParse = SessionIdSchema.safeParse(params.id);
  if (!idParse.success) {
    return NextResponse.json({ ok: false, error: "Invalid session ID." }, { status: 400 });
  }

  const nodeIdParse = NodeIdSchema.safeParse(params.nodeId);
  if (!nodeIdParse.success) {
    return NextResponse.json({ ok: false, error: "Invalid node ID." }, { status: 400 });
  }

  const store = getSessionStore();
  const session = await store.get(idParse.data);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  }

  if (session.phase !== "authoring") {
    return NextResponse.json(
      { ok: false, error: `Node regen requires 'authoring' phase; current: ${session.phase}` },
      { status: 409 }
    );
  }

  if (!session.graph) {
    return NextResponse.json({ ok: false, error: "Session has no graph." }, { status: 400 });
  }

  const nodeIndex = session.graph.nodes.findIndex((n) => n.id === nodeIdParse.data);
  if (nodeIndex === -1) {
    return NextResponse.json({ ok: false, error: "Node not found in graph." }, { status: 404 });
  }

  const node = session.graph.nodes[nodeIndex];

  const systemPrompt =
    "You are a Pathfinder 2e Game Master assistant. Generate a vivid, evocative narration seed for the scene described. " +
    "Return ONLY the narration text (1-2 paragraphs, max 400 words). Polish language.";

  const userPrompt =
    `Scene: ${node.title}\nSynopsis: ${node.synopsis}\nTension level: ${node.tensionLevel}/10\n` +
    `Kind: ${node.kind}\n\nGenerate a narration seed for this scene.`;

  let newPrompt: string;
  try {
    newPrompt = await callLLM({
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.8,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: `LLM call failed: ${message}` }, { status: 500 });
  }

  const updatedNodes = session.graph.nodes.map((n, i) =>
    i === nodeIndex ? { ...n, prompt: newPrompt.trim() } : n
  );

  const updated = await store.updateGraph(idParse.data, { nodes: updatedNodes });
  return NextResponse.json({ ok: true, session: updated, nodeId: nodeIdParse.data });
}
