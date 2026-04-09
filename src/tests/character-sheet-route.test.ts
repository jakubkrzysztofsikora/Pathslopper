import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const callClaudeMock = vi.fn();

vi.mock("@/lib/llm/anthropic-client", () => ({
  callClaude: (...args: unknown[]) => callClaudeMock(...args),
}));

import { POST } from "@/app/api/character-sheet/route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/character-sheet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// A small valid base64 string that satisfies the schema regex and size limits.
const tinyBase64 = Buffer.from("fake-image-bytes").toString("base64");

const pf1eFixture = {
  version: "pf1e",
  name: "Valeros",
  race: "Human",
  classes: ["Fighter"],
  level: 4,
  feats: ["Power Attack", "Cleave"],
  bab: 4,
  saves: { fortitude: 5, reflex: 2, will: 1 },
  abilityScores: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 },
};

const pf2eFixture = {
  version: "pf2e",
  name: "Kyra",
  ancestry: "Human",
  background: "Acolyte",
  class: "Cleric",
  level: 3,
  actionTags: ["Strike", "Heal"],
  proficiencies: { perception: "trained", fortitude: "expert" },
  abilityScores: { str: 12, dex: 10, con: 14, int: 10, wis: 18, cha: 12 },
};

describe("POST /api/character-sheet", () => {
  beforeEach(() => {
    callClaudeMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 400 on malformed JSON body", async () => {
    const res = await POST(makeRequest("not-json"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(callClaudeMock).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid request schema", async () => {
    const res = await POST(
      makeRequest({
        imageBase64: tinyBase64,
        mimeType: "application/pdf", // not in the enum
        version: "pf2e",
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(callClaudeMock).not.toHaveBeenCalled();
  });

  it("parses a PF1e VLM response end-to-end", async () => {
    callClaudeMock.mockResolvedValueOnce(JSON.stringify(pf1eFixture));
    const res = await POST(
      makeRequest({
        imageBase64: tinyBase64,
        mimeType: "image/png",
        version: "pf1e",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.version).toBe("pf1e");
    expect(json.data.feats).toContain("Power Attack");
    expect(json.data.bab).toBe(4);

    // Verify the system prompt carried the PF1e branding.
    const callArgs = callClaudeMock.mock.calls[0][0];
    expect(callArgs.system).toContain("Pathfinder 1st Edition");
  });

  it("parses a PF2e VLM response with discriminated-union narrowing", async () => {
    callClaudeMock.mockResolvedValueOnce(
      `\`\`\`json\n${JSON.stringify(pf2eFixture)}\n\`\`\``
    );
    const res = await POST(
      makeRequest({
        imageBase64: tinyBase64,
        mimeType: "image/jpeg",
        version: "pf2e",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.version).toBe("pf2e");
    expect(json.data.ancestry).toBe("Human");
    expect(json.data.proficiencies.perception).toBe("trained");
  });

  it("returns 502 with sanitised error when upstream call throws", async () => {
    callClaudeMock.mockRejectedValueOnce(
      new Error("APIError: 429 rate limited (request_id=req_xyz)")
    );
    const res = await POST(
      makeRequest({
        imageBase64: tinyBase64,
        mimeType: "image/png",
        version: "pf2e",
      })
    );
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("Upstream model call failed.");
    expect(JSON.stringify(json)).not.toContain("req_xyz");
  });

  it("returns 422 when VLM response cannot be parsed against the schema", async () => {
    callClaudeMock.mockResolvedValueOnce(
      JSON.stringify({ version: "pf2e", name: "Broken" }) // missing required fields
    );
    const res = await POST(
      makeRequest({
        imageBase64: tinyBase64,
        mimeType: "image/png",
        version: "pf2e",
      })
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(Array.isArray(json.warnings)).toBe(true);
  });
});
