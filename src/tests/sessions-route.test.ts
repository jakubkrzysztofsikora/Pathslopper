import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as createSessionPOST } from "@/app/api/sessions/route";
import { GET as getSessionGET } from "@/app/api/sessions/[id]/route";
import { getSessionStore } from "@/lib/state/server/store-factory";

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function getRequest(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

describe("POST /api/sessions", () => {
  beforeEach(async () => {
    await getSessionStore()._reset();
  });

  it("creates a session for PF2e and returns the state", async () => {
    const res = await createSessionPOST(
      jsonRequest("http://localhost/api/sessions", { version: "pf2e" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.session.version).toBe("pf2e");
    expect(json.session.phase).toBe("brief");
    expect(json.session.characters).toEqual([]);
    expect(typeof json.session.id).toBe("string");
  });

  it("returns 400 on invalid version", async () => {
    const res = await createSessionPOST(
      jsonRequest("http://localhost/api/sessions", { version: "pf3e" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on malformed JSON", async () => {
    const res = await createSessionPOST(
      jsonRequest("http://localhost/api/sessions", "not-json")
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/sessions/[id]", () => {
  beforeEach(async () => {
    await getSessionStore()._reset();
  });

  it("returns the session state for a valid ID", async () => {
    const created = await getSessionStore().create("pf1e");
    const res = await getSessionGET(
      getRequest(`http://localhost/api/sessions/${created.id}`),
      { params: { id: created.id } }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.session.id).toBe(created.id);
    expect(json.session.version).toBe("pf1e");
  });

  it("returns 400 on a malformed ID", async () => {
    const res = await getSessionGET(
      getRequest("http://localhost/api/sessions/bad id"),
      { params: { id: "bad id" } }
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for a well-formed but unknown ID", async () => {
    const res = await getSessionGET(
      getRequest("http://localhost/api/sessions/abcdefgh12345678"),
      { params: { id: "abcdefgh12345678" } }
    );
    expect(res.status).toBe(404);
  });
});
