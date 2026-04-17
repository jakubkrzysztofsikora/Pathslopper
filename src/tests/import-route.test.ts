import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { getSessionStore } from "@/lib/state/server/store-factory";
import type { ImportSessionResult } from "@/lib/orchestration/import/import-session";
import type { SessionGraph } from "@/lib/schemas/session-graph";
import { makeGraph } from "@/tests/factories/graph-factory";

vi.mock("@/lib/llm/client", () => ({
  callLLM: vi.fn(),
}));

const importSessionMock = vi.fn();

vi.mock("@/lib/orchestration/import/import-session", () => ({
  importSession: (...args: unknown[]) => importSessionMock(...args),
}));

vi.mock("@/lib/orchestration/director/ink", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orchestration/director/ink")>();
  return {
    ...actual,
    compileGraph: vi.fn().mockResolvedValue({ compiledJson: "MOCK", warnings: [] }),
  };
});

import { POST } from "@/app/api/sessions/[id]/import/route";

function postRequest(id: string, body: unknown, query = ""): NextRequest {
  const url = `http://localhost/api/sessions/${id}/import${query}`;
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function buildOkResult(graph: SessionGraph): ImportSessionResult {
  return {
    ok: true,
    graph,
    warnings: [],
    pendingConsent: { clocks: true, fronts: true, endings: true },
    repairs: [],
  };
}

describe("POST /api/sessions/[id]/import", () => {
  beforeEach(async () => {
    await getSessionStore()._reset();
    importSessionMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 400 for invalid session ID", async () => {
    const res = await POST(postRequest("!!!bad", { content: "x" }), {
      params: { id: "!!!bad" },
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown session", async () => {
    const res = await POST(postRequest("abcdefgh12345678", { content: "x" }), {
      params: { id: "abcdefgh12345678" },
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when body has neither content nor uploadKey", async () => {
    const session = await getSessionStore().create("pf2e");
    const res = await POST(postRequest(session.id, {}), { params: { id: session.id } });
    expect(res.status).toBe(400);
  });

  it("happy path: imports into a brief-phase session, returns 200 with graph + provenance", async () => {
    const session = await getSessionStore().create("pf2e");
    const graph = makeGraph({
      id: session.id,
      provenance: { synthesized: { "scene-1": ["prompt"] } },
    });
    importSessionMock.mockResolvedValue(buildOkResult(graph));

    const res = await POST(
      postRequest(session.id, { content: "# Test\n\n## Scenes\n- One\n" }),
      { params: { id: session.id } }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.graph).toBeDefined();
    expect(json.pendingConsent).toEqual({ clocks: true, fronts: true, endings: true });

    const stored = await getSessionStore().get(session.id);
    expect(stored?.phase).toBe("authoring");
    expect(stored?.graph?.provenance?.synthesized["scene-1"]).toContain("prompt");
  });

  it("returns 500 with stage detail on importSession failure", async () => {
    const session = await getSessionStore().create("pf2e");
    importSessionMock.mockResolvedValue({ ok: false, stage: "C", error: "parse failure" });

    const res = await POST(
      postRequest(session.id, { content: "# Test\n\n## Scenes\n- One\n" }),
      { params: { id: session.id } }
    );

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.stage).toBe("C");
  });

  it("returns 400 when input errors are detected (stage=input)", async () => {
    const session = await getSessionStore().create("pf2e");
    importSessionMock.mockResolvedValue({ ok: false, stage: "input", error: "Import content is empty." });

    const res = await POST(
      postRequest(session.id, { content: "" }),
      { params: { id: session.id } }
    );

    expect(res.status).toBe(400);
  });

  it("re-import over authoring phase: returns 409 without confirm query", async () => {
    const session = await getSessionStore().create("pf2e");
    // Move to authoring by putting a graph there
    const existingGraph = makeGraph({ id: session.id });
    await getSessionStore().setGraph(session.id, existingGraph);

    const res = await POST(
      postRequest(session.id, { content: "# new content" }),
      { params: { id: session.id } }
    );

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.ok).toBe(false);
    // The body should include a preview of the existing graph so the UI
    // can show the user what would be overwritten.
    expect(json.existingGraph).toBeDefined();
    expect(json.existingGraph.nodeCount).toBeGreaterThan(0);
  });

  it("re-import over authoring phase with ?confirm=overwrite succeeds", async () => {
    const session = await getSessionStore().create("pf2e");
    const existingGraph = makeGraph({ id: session.id });
    await getSessionStore().setGraph(session.id, existingGraph);

    const newGraph = makeGraph({ id: session.id });
    importSessionMock.mockResolvedValue(buildOkResult(newGraph));

    const res = await POST(
      postRequest(session.id, { content: "# new" }, "?confirm=overwrite"),
      { params: { id: session.id } }
    );

    expect(res.status).toBe(200);
    const stored = await getSessionStore().get(session.id);
    expect(stored?.phase).toBe("authoring");
  });

  it("re-import blocked for approved phase regardless of confirm", async () => {
    const session = await getSessionStore().create("pf2e");
    const existingGraph = makeGraph({ id: session.id });
    await getSessionStore().setGraph(session.id, existingGraph);
    await getSessionStore().approve(session.id, "MOCK_COMPILED");

    const res = await POST(
      postRequest(session.id, { content: "# new" }, "?confirm=overwrite"),
      { params: { id: session.id } }
    );

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/approved/i);
  });
});
