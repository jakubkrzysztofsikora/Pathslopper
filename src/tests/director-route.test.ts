import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { getSessionStore } from "@/lib/state/server/store-factory";
import { FIXTURE_GRAPH, MINIMAL_BRIEF } from "./fixtures/session-graph";

vi.mock("@/lib/llm/client", () => ({
  callLLM: vi.fn(),
}));

const directorMock = vi.fn();
vi.mock("@/lib/orchestration/director/director", () => ({
  director: (...args: unknown[]) => directorMock(...args),
}));

import { POST } from "@/app/api/director/route";

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/director", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/director", () => {
  beforeEach(async () => {
    await getSessionStore()._reset();
    directorMock.mockReset();
  });

  it("returns 400 for invalid body", async () => {
    const res = await POST(postRequest({ sessionId: "bad!!!id", input: { type: "start" } }));
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown session", async () => {
    const res = await POST(postRequest({ sessionId: "abcdefgh12345678", input: { type: "start" } }));
    expect(res.status).toBe(404);
  });

  it("returns 409 when session not in play phase", async () => {
    const session = await getSessionStore().create("pf2e");
    const res = await POST(postRequest({ sessionId: session.id, input: { type: "start" } }));
    expect(res.status).toBe(409);
  });

  it("returns 200 with director output on success", async () => {
    const session = await getSessionStore().create("pf2e");
    await getSessionStore().setBrief(session.id, MINIMAL_BRIEF);
    await getSessionStore().setGraph(session.id, FIXTURE_GRAPH);
    await getSessionStore().approve(session.id, '{"inkVersion":21}');

    const mockOutput = {
      narration: "Drużyna stoi przed bramą.",
      choices: [],
      phase: "narrating",
      lastMove: "cutscene",
      worldState: session.worldState,
      ended: false,
    };
    directorMock.mockResolvedValue(mockOutput);

    const res = await POST(postRequest({ sessionId: session.id, input: { type: "start" } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.output.narration).toBe("Drużyna stoi przed bramą.");
  });
});
