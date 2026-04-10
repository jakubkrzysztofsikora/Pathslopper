import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as postCharacter } from "@/app/api/sessions/[id]/characters/route";
import { getSessionStore } from "@/lib/state/server/store-factory";
import type { CharacterSheetParsed } from "@/lib/schemas/character-sheet";

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validCharacter = {
  version: "pf2e",
  name: "Aldric",
  ancestry: "Human",
  background: "Scholar",
  class: "Wizard",
  level: 5,
  actionTags: [],
  proficiencies: { Arcana: "expert" },
  abilityScores: {
    str: 10,
    dex: 14,
    con: 12,
    int: 18,
    wis: 14,
    cha: 10,
  },
};

describe("POST /api/sessions/[id]/characters", () => {
  let sessionId: string;

  beforeEach(async () => {
    await getSessionStore()._reset();
    const session = await getSessionStore().create("pf2e");
    sessionId = session.id;
  });

  it("returns 200 and session on valid character POST", async () => {
    const res = await postCharacter(
      jsonRequest(
        `http://localhost/api/sessions/${sessionId}/characters`,
        validCharacter
      ),
      { params: { id: sessionId } }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.session.characters).toHaveLength(1);
    expect(json.session.characters[0].name).toBe("Aldric");
  });

  it("returns 400 on invalid session ID format", async () => {
    const res = await postCharacter(
      jsonRequest(
        "http://localhost/api/sessions/bad id/characters",
        validCharacter
      ),
      { params: { id: "bad id" } }
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown session ID", async () => {
    const res = await postCharacter(
      jsonRequest(
        "http://localhost/api/sessions/abcdefgh12345678/characters",
        validCharacter
      ),
      { params: { id: "abcdefgh12345678" } }
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 on invalid character body", async () => {
    const res = await postCharacter(
      jsonRequest(
        `http://localhost/api/sessions/${sessionId}/characters`,
        { name: "bad", version: "pf99e" }
      ),
      { params: { id: sessionId } }
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 when roster is full", async () => {
    // Fill roster to 12
    for (let i = 0; i < 12; i++) {
      await getSessionStore().addCharacter(sessionId, {
        ...validCharacter,
        name: `Character${i}`,
      } as CharacterSheetParsed);
    }
    const res = await postCharacter(
      jsonRequest(
        `http://localhost/api/sessions/${sessionId}/characters`,
        { ...validCharacter, name: "Overflow" }
      ),
      { params: { id: sessionId } }
    );
    expect(res.status).toBe(409);
  });

  it("returns 409 on duplicate character name", async () => {
    await getSessionStore().addCharacter(sessionId, validCharacter as CharacterSheetParsed);
    const res = await postCharacter(
      jsonRequest(
        `http://localhost/api/sessions/${sessionId}/characters`,
        { ...validCharacter, name: "aldric" }
      ),
      { params: { id: sessionId } }
    );
    expect(res.status).toBe(409);
  });
});
