import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { getSessionStore } from "@/lib/state/server/store-factory";
import { POST } from "@/app/api/sessions/[id]/validate/route";
import { FIXTURE_GRAPH, MINIMAL_BRIEF } from "./fixtures/session-graph";

function postRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/sessions/${id}/validate`, {
    method: "POST",
  });
}

describe("POST /api/sessions/[id]/validate", () => {
  beforeEach(async () => {
    await getSessionStore()._reset();
  });

  it("returns 404 for unknown session", async () => {
    const res = await POST(postRequest("abcdefgh12345678"), {
      params: { id: "abcdefgh12345678" },
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when session has no graph", async () => {
    const session = await getSessionStore().create("pf2e");
    const res = await POST(postRequest(session.id), { params: { id: session.id } });
    expect(res.status).toBe(400);
  });

  it("returns 200 with empty issues for a valid graph", async () => {
    const session = await getSessionStore().create("pf2e");
    await getSessionStore().setBrief(session.id, MINIMAL_BRIEF);
    await getSessionStore().setGraph(session.id, FIXTURE_GRAPH);

    const res = await POST(postRequest(session.id), { params: { id: session.id } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.issues).toEqual([]);
  });
});
