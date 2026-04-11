import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { getSessionStore } from "@/lib/state/server/store-factory";
import type { SessionBrief } from "@/lib/schemas/session-brief";
import type { GenerateSessionResult } from "@/lib/orchestration/generate-session";
import type { SessionGraph } from "@/lib/schemas/session-graph";

// Mock the LLM client so the real callLLM is never invoked in this test.
vi.mock("@/lib/llm/client", () => ({
  callLLM: vi.fn(),
}));

const generateSessionMock = vi.fn();

vi.mock("@/lib/orchestration/generate-session", () => ({
  generateSession: (...args: unknown[]) => generateSessionMock(...args),
}));

// Import AFTER vi.mock so the route is wired to the mocked modules.
import { POST } from "@/app/api/sessions/[id]/generate/route";

function postRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/sessions/${id}/generate`, {
    method: "POST",
  });
}

const MINIMAL_BRIEF: SessionBrief = {
  version: "pf2e",
  partySize: 4,
  partyLevel: 3,
  targetDurationHours: 4,
  tone: "heroic",
  setting: "ruiny",
  presetId: "classic",
  storyDna: {
    version: "pf2e",
    sliders: {
      narrativePacing: 5,
      tacticalLethality: 5,
      npcImprov: 5,
    },
    tags: { include: [], exclude: [] },
  },
  characterHooks: [],
  safetyTools: { lines: [], veils: [], xCardEnabled: true },
};

// A minimal valid SessionGraph that satisfies SessionGraphSchema.
// All referential-integrity constraints must hold.
const NOW = new Date().toISOString();
const FIXTURE_GRAPH: SessionGraph = {
  id: "test-graph-id",
  version: "pf2e",
  brief: MINIMAL_BRIEF,
  startNodeId: "node-start",
  createdAt: NOW,
  updatedAt: NOW,
  nodes: [
    {
      id: "node-start",
      kind: "strong-start",
      act: 1,
      title: "Początek",
      synopsis: "Drużyna przybywa na miejsce.",
      prompt: "Gracze stoją przed bramą.",
      estimatedMinutes: 20,
      tensionLevel: 5,
      npcsPresent: [],
      obstacles: [],
      contentWarnings: [],
      tags: [],
      onEnterEffects: [],
      repeatable: false,
    },
    {
      id: "node-s2",
      kind: "scene",
      act: 1,
      title: "Scena 2",
      synopsis: "Eksploracja.",
      prompt: "Ciemny korytarz.",
      estimatedMinutes: 20,
      tensionLevel: 3,
      npcsPresent: [],
      obstacles: [],
      contentWarnings: [],
      tags: [],
      onEnterEffects: [],
      repeatable: false,
    },
    {
      id: "node-s3",
      kind: "scene",
      act: 1,
      title: "Scena 3",
      synopsis: "Odkrycie.",
      prompt: "Gracze odnajdują ślady.",
      estimatedMinutes: 20,
      tensionLevel: 4,
      npcsPresent: [],
      obstacles: [],
      contentWarnings: [],
      tags: [],
      onEnterEffects: [],
      repeatable: false,
    },
    {
      id: "node-s4",
      kind: "scene",
      act: 2,
      title: "Scena 4",
      synopsis: "Konfrontacja.",
      prompt: "Strażnik blokuje drogę.",
      estimatedMinutes: 30,
      tensionLevel: 6,
      npcsPresent: ["npc-1"],
      obstacles: [],
      contentWarnings: [],
      tags: [],
      onEnterEffects: [],
      repeatable: false,
    },
    {
      id: "node-s5",
      kind: "scene",
      act: 2,
      title: "Scena 5",
      synopsis: "Negocjacje.",
      prompt: "Rozmowa z przywódcą.",
      estimatedMinutes: 25,
      tensionLevel: 7,
      npcsPresent: ["npc-1"],
      obstacles: [],
      contentWarnings: [],
      tags: [],
      onEnterEffects: [],
      repeatable: false,
    },
    {
      id: "node-s6",
      kind: "scene",
      act: 2,
      title: "Scena 6",
      synopsis: "Poszukiwania.",
      prompt: "Gracze szukają klucza.",
      estimatedMinutes: 20,
      tensionLevel: 5,
      npcsPresent: [],
      obstacles: [],
      contentWarnings: [],
      tags: [],
      onEnterEffects: [],
      repeatable: false,
    },
    {
      id: "node-s7",
      kind: "scene",
      act: 3,
      title: "Scena 7",
      synopsis: "Finał.",
      prompt: "Ostatnia bitwa zbliża się.",
      estimatedMinutes: 40,
      tensionLevel: 9,
      npcsPresent: ["npc-1"],
      obstacles: [],
      contentWarnings: [],
      tags: [],
      onEnterEffects: [],
      repeatable: false,
    },
    {
      id: "node-s8",
      kind: "scene",
      act: 3,
      title: "Scena 8",
      synopsis: "Ucieczka.",
      prompt: "Gracze muszą uciec.",
      estimatedMinutes: 20,
      tensionLevel: 8,
      npcsPresent: [],
      obstacles: [],
      contentWarnings: [],
      tags: [],
      onEnterEffects: [],
      repeatable: false,
    },
    {
      id: "node-victory",
      kind: "ending",
      act: 3,
      title: "Zwycięstwo",
      synopsis: "Misja zakończona sukcesem.",
      prompt: "Drużyna triumfuje.",
      estimatedMinutes: 10,
      tensionLevel: 2,
      npcsPresent: [],
      obstacles: [],
      contentWarnings: [],
      tags: [],
      onEnterEffects: [],
      repeatable: false,
    },
    {
      id: "node-defeat",
      kind: "ending",
      act: 3,
      title: "Porażka",
      synopsis: "Drużyna pokonana.",
      prompt: "Mroczna chwila.",
      estimatedMinutes: 10,
      tensionLevel: 1,
      npcsPresent: [],
      obstacles: [],
      contentWarnings: [],
      tags: [],
      onEnterEffects: [],
      repeatable: false,
    },
  ],
  edges: [
    { id: "e1", from: "node-start", to: "node-s2", kind: "auto", onTraverseEffects: [], priority: 0 },
    { id: "e2", from: "node-s2", to: "node-s3", kind: "auto", onTraverseEffects: [], priority: 0 },
    { id: "e3", from: "node-s3", to: "node-s4", kind: "choice", onTraverseEffects: [], priority: 0 },
    { id: "e4", from: "node-s4", to: "node-s5", kind: "choice", onTraverseEffects: [], priority: 0 },
    { id: "e5", from: "node-s5", to: "node-s6", kind: "auto", onTraverseEffects: [], priority: 0 },
    { id: "e6", from: "node-s6", to: "node-s7", kind: "auto", onTraverseEffects: [], priority: 0 },
    { id: "e7", from: "node-s7", to: "node-s8", kind: "choice", onTraverseEffects: [], priority: 0 },
    { id: "e8", from: "node-s8", to: "node-victory", kind: "auto", onTraverseEffects: [], priority: 0 },
    {
      id: "e9",
      from: "node-s7",
      to: "node-defeat",
      kind: "clock-trigger",
      clockId: "clock-1",
      onTraverseEffects: [],
      priority: 0,
    },
  ],
  clocks: [
    { id: "clock-1", label: "Alarm", segments: 4, filled: 0, polarity: "danger", tickSources: ["hard-move", "fail"] },
    { id: "clock-2", label: "Szansa", segments: 6, filled: 0, polarity: "opportunity", tickSources: ["scene-enter"] },
  ],
  fronts: [
    {
      id: "front-1",
      name: "Tyran",
      stakes: ["Czy drużyna pokona tyrana?"],
      dangers: [{ name: "Straż", impulse: "Aresztować wszystkich." }],
      grimPortents: ["Podatki rosną.", "Mury się wzmacniają.", "Opór milknie."],
      impendingDoom: "Całkowite zniewolenie regionu.",
      firedPortents: 0,
    },
  ],
  secrets: [
    { id: "s1", text: "Tyran ma sekretne wejście.", conclusionTag: "end-tyrant", discovered: false, delivery: "npc-dialog", requires: [] },
    { id: "s2", text: "Kapitan straży jest zdrajcą.", conclusionTag: "end-tyrant", discovered: false, delivery: "document", requires: [] },
    { id: "s3", text: "W lochach są więźniowie.", conclusionTag: "rescue", discovered: false, delivery: "environmental", requires: [] },
    { id: "s4", text: "Klucz jest w wieży.", conclusionTag: "end-tyrant", discovered: false, delivery: "skill-check", requires: [] },
    { id: "s5", text: "Strażnik to były sojusznik.", conclusionTag: "rescue", discovered: false, delivery: "npc-dialog", requires: [] },
    { id: "s6", text: "Mapa jest sfałszowana.", conclusionTag: "escape", discovered: false, delivery: "document", requires: [] },
  ],
  npcs: [
    { id: "npc-1", name: "Kapitan Marek", role: "antagonist", goal: "Chronić twierdzę.", voice: "Zimny, rozkazujący.", disposition: -2 },
    { id: "npc-2", name: "Aleksy", role: "informant", goal: "Pomóc bohaterom.", voice: "Nerwowy, szybki.", disposition: 2 },
    { id: "npc-3", name: "Strażnik Lech", role: "neutral", goal: "Przeżyć.", voice: "Zmęczony.", disposition: 0 },
  ],
  locations: [
    { id: "loc-1", name: "Brama", aspects: ["Masywna", "Strzeżona"] },
    { id: "loc-2", name: "Wieża", aspects: ["Wysoka", "Ciemna", "Zimna"] },
  ],
  endings: [
    {
      id: "end-victory",
      nodeId: "node-victory",
      condition: { op: "flag-set", flag: "tyrant-defeated" },
      title: "Wolność",
      summary: "Tyran pokonany, region wolny.",
      category: "victory",
      frontOutcomes: { "front-1": "neutralized" },
    },
    {
      id: "end-defeat",
      nodeId: "node-defeat",
      condition: { op: "clock-filled", clockId: "clock-1" },
      title: "Klęska",
      summary: "Drużyna pokonana.",
      category: "defeat",
      frontOutcomes: { "front-1": "escalated" },
    },
  ],
};

describe("POST /api/sessions/[id]/generate", () => {
  beforeEach(async () => {
    await getSessionStore()._reset();
    generateSessionMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 404 for unknown session", async () => {
    const res = await POST(postRequest("abcdefgh12345678"), { params: { id: "abcdefgh12345678" } });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it("returns 400 when session has no brief", async () => {
    const session = await getSessionStore().create("pf2e");
    const res = await POST(postRequest(session.id), { params: { id: session.id } });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/no brief/i);
  });

  it("returns 409 when session is not in brief phase", async () => {
    const session = await getSessionStore().create("pf2e");
    // Transition to a non-brief phase
    await getSessionStore().approve(session.id, "compiled");
    const res = await POST(postRequest(session.id), { params: { id: session.id } });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/brief.*phase/i);
  });

  it("returns 500 when generator fails", async () => {
    const session = await getSessionStore().create("pf2e");
    await getSessionStore().setBrief(session.id, MINIMAL_BRIEF);

    generateSessionMock.mockResolvedValue({
      ok: false,
      stage: "A",
      error: "Upstream model call failed.",
    });

    const res = await POST(postRequest(session.id), { params: { id: session.id } });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.stage).toBe("A");
  });

  it("returns 200 with updated session when generator succeeds", async () => {
    const session = await getSessionStore().create("pf2e");
    await getSessionStore().setBrief(session.id, MINIMAL_BRIEF);

    generateSessionMock.mockResolvedValue({
      ok: true,
      graph: FIXTURE_GRAPH,
      warnings: [],
    });

    const res = await POST(postRequest(session.id), { params: { id: session.id } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.session.phase).toBe("authoring");
    expect(json.session.graph.id).toBe("test-graph-id");
    expect(json.warnings).toEqual([]);
  });
});
