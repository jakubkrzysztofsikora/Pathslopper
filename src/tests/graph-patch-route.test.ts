import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { getSessionStore } from "@/lib/state/server/store-factory";
import { FIXTURE_GRAPH, MINIMAL_BRIEF } from "./fixtures/session-graph";
import { PATCH } from "@/app/api/sessions/[id]/graph/route";

function patchRequest(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/sessions/${id}/graph`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/sessions/[id]/graph", () => {
  beforeEach(async () => {
    await getSessionStore()._reset();
  });

  it("returns 404 for unknown session", async () => {
    const res = await PATCH(patchRequest("abcdefgh12345678", { patch: {} }), {
      params: { id: "abcdefgh12345678" },
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when session is not in authoring phase", async () => {
    const session = await getSessionStore().create("pf2e");
    const res = await PATCH(patchRequest(session.id, { patch: {} }), {
      params: { id: session.id },
    });
    expect(res.status).toBe(409);
  });

  it("returns 400 for invalid body", async () => {
    const session = await getSessionStore().create("pf2e");
    await getSessionStore().setBrief(session.id, MINIMAL_BRIEF);
    await getSessionStore().setGraph(session.id, FIXTURE_GRAPH);

    const req = new NextRequest(`http://localhost/api/sessions/${session.id}/graph`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await PATCH(req, { params: { id: session.id } });
    expect(res.status).toBe(400);
  });

  it("applies a valid patch to the graph", async () => {
    const session = await getSessionStore().create("pf2e");
    await getSessionStore().setBrief(session.id, MINIMAL_BRIEF);
    await getSessionStore().setGraph(session.id, FIXTURE_GRAPH);

    const patchedNodes = FIXTURE_GRAPH.nodes.map((n) =>
      n.id === "node-start" ? { ...n, title: "Zmieniony tytuł" } : n
    );

    const res = await PATCH(patchRequest(session.id, { patch: { nodes: patchedNodes } }), {
      params: { id: session.id },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    const startNode = json.session.graph.nodes.find((n: { id: string }) => n.id === "node-start");
    expect(startNode.title).toBe("Zmieniony tytuł");
  });
});
