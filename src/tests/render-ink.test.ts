import { describe, it, expect } from "vitest";
import { renderInkSource } from "@/lib/orchestration/director/render-ink";
import type { SessionGraph, SessionNode, SessionEdge } from "@/lib/schemas/session-graph";

// ---------------------------------------------------------------------------
// Minimal fixture helpers — produce the smallest valid SessionGraph structure
// ---------------------------------------------------------------------------

function makeNode(
  id: string,
  kind: SessionNode["kind"],
  overrides: Partial<SessionNode> = {}
): SessionNode {
  return {
    id,
    kind,
    act: 1,
    title: `Title ${id}`,
    synopsis: `Synopsis for ${id}`,
    prompt: `Prompt for ${id}`,
    obstacles: [],
    contentWarnings: [],
    npcsPresent: [],
    tensionLevel: 3,
    tags: [],
    onEnterEffects: [],
    repeatable: false,
    estimatedMinutes: 20,
    ...overrides,
  };
}

function makeEdge(
  id: string,
  from: string,
  to: string,
  kind: SessionEdge["kind"],
  overrides: Partial<SessionEdge> = {}
): SessionEdge {
  return {
    id,
    from,
    to,
    kind,
    onTraverseEffects: [],
    priority: 0,
    ...overrides,
  };
}

// Build a minimal valid SessionGraph (8 nodes, 2 clocks, etc.)
function makeGraph(overrides: Partial<SessionGraph> = {}): SessionGraph {
  const nodes: SessionNode[] = [
    makeNode("start", "strong-start"),
    makeNode("scene1", "scene"),
    makeNode("scene2", "scene"),
    makeNode("hub", "hub"),
    makeNode("combat1", "combat-narrative"),
    makeNode("explore", "exploration"),
    makeNode("cutscene", "cutscene"),
    makeNode("end_victory", "ending"),
    makeNode("end_defeat", "ending"),
  ];

  const edges: SessionEdge[] = [
    makeEdge("e1", "start", "scene1", "auto"),
    makeEdge("e2", "scene1", "scene2", "auto"),
    makeEdge("e3", "scene2", "hub", "auto"),
    makeEdge("e4", "hub", "combat1", "choice", { label: "Fight" }),
    makeEdge("e5", "hub", "explore", "choice", { label: "Explore" }),
    makeEdge("e6", "combat1", "cutscene", "auto"),
    makeEdge("e7", "explore", "cutscene", "auto"),
    makeEdge("e8", "cutscene", "end_victory", "auto"),
  ];

  const now = new Date().toISOString();
  return {
    id: "test-graph-1",
    version: "pf2e",
    brief: {
      version: "pf2e",
      partySize: 4,
      partyLevel: 3,
      targetDurationHours: 4,
      tone: "dark",
      setting: "a dungeon",
      presetId: "classic",
      storyDna: {
        version: "pf2e",
        sliders: { narrativePacing: 50, tacticalLethality: 50, npcImprov: 50 },
        tags: { include: [], exclude: [] },
      },
      characterHooks: [],
      safetyTools: { lines: [], veils: [], xCardEnabled: true },
    },
    startNodeId: "start",
    nodes,
    edges,
    clocks: [
      { id: "clock1", label: "Danger Clock", segments: 4, filled: 0, polarity: "danger", tickSources: ["hard-move"] },
      { id: "clock2", label: "Opportunity Clock", segments: 6, filled: 0, polarity: "opportunity", tickSources: ["fail"] },
    ],
    fronts: [
      {
        id: "front1",
        name: "The Dark Front",
        stakes: ["Will the party survive?"],
        dangers: [{ name: "Villain", impulse: "Destroy" }],
        grimPortents: ["portent1", "portent2", "portent3"],
        impendingDoom: "Total destruction",
        firedPortents: 0,
      },
    ],
    secrets: [
      { id: "s1", text: "Secret 1", conclusionTag: "c1", discovered: false, delivery: "npc-dialog", requires: [] },
      { id: "s2", text: "Secret 2", conclusionTag: "c1", discovered: false, delivery: "environmental", requires: [] },
      { id: "s3", text: "Secret 3", conclusionTag: "c2", discovered: false, delivery: "document", requires: [] },
      { id: "s4", text: "Secret 4", conclusionTag: "c2", discovered: false, delivery: "overheard", requires: [] },
      { id: "s5", text: "Secret 5", conclusionTag: "c3", discovered: false, delivery: "pc-backstory", requires: [] },
      { id: "s6", text: "Secret 6", conclusionTag: "c3", discovered: false, delivery: "skill-check", requires: [] },
    ],
    npcs: [
      { id: "npc1", name: "Guard", role: "obstacle", goal: "Stop intruders", voice: "gruff", disposition: -1 },
      { id: "npc2", name: "Merchant", role: "ally", goal: "Make money", voice: "friendly", disposition: 1 },
      { id: "npc3", name: "Villain", role: "antagonist", goal: "World domination", voice: "menacing", disposition: -3 },
    ],
    locations: [
      { id: "loc1", name: "Dungeon", aspects: ["dark", "damp"] },
      { id: "loc2", name: "Town Square", aspects: ["busy", "bright"] },
    ],
    endings: [
      { id: "end1", nodeId: "end_victory", condition: { op: "flag-set", flag: "won" }, title: "Victory", summary: "Party wins", category: "victory", frontOutcomes: {} },
      { id: "end2", nodeId: "end_defeat", condition: { op: "flag-set", flag: "lost" }, title: "Defeat", summary: "Party loses", category: "defeat", frontOutcomes: {} },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("renderInkSource — strong-start knot entry", () => {
  it("renders the start knot with === knot_start === header", () => {
    const graph = makeGraph();
    const src = renderInkSource(graph);
    expect(src).toContain("=== knot_start ===");
  });

  it("emits entry point divert to start knot", () => {
    const graph = makeGraph();
    const src = renderInkSource(graph);
    expect(src).toContain("-> knot_start");
  });

  it("includes the node prompt text in the knot body", () => {
    const graph = makeGraph();
    const src = renderInkSource(graph);
    expect(src).toContain("Prompt for start");
  });
});

describe("renderInkSource — auto edge", () => {
  it("renders auto edge as unconditional divert after body", () => {
    const graph = makeGraph();
    const src = renderInkSource(graph);
    // start → scene1 is auto edge
    const knotBlock = src.split("=== knot_start ===")[1]?.split("=== knot_")[0] ?? "";
    expect(knotBlock).toContain("-> knot_scene1");
    // Should not be a choice (no leading *)
    const lines = knotBlock.split("\n");
    const divertLine = lines.find((l) => l.trim() === "-> knot_scene1");
    expect(divertLine).toBeDefined();
    expect(divertLine!.trim().startsWith("*")).toBe(false);
  });
});

describe("renderInkSource — choice edge with predicate condition", () => {
  it("renders flag-set condition on choice edge", () => {
    const flagNode = makeNode("flag_scene", "scene");
    const condEdge = makeEdge("cond_e", "hub", "flag_scene", "choice", {
      label: "Unlock Door",
      condition: { op: "flag-set", flag: "has_key" },
    });
    const graph = makeGraph();
    // Add flagNode and condEdge to graph
    const nodes = [...graph.nodes, flagNode];
    const edges = [...graph.edges, condEdge];
    const src = renderInkSource({ ...graph, nodes, edges });
    expect(src).toContain("flag_has_key");
    expect(src).toContain("[Unlock Door]");
    expect(src).toContain("{flag_has_key}");
  });

  it("renders flag-unset condition", () => {
    const graph = makeGraph();
    const condEdge = makeEdge("cond_u", "hub", "explore", "choice", {
      label: "Enter Secret Room",
      condition: { op: "flag-unset", flag: "door_locked" },
    });
    const edges = [...graph.edges, condEdge];
    const src = renderInkSource({ ...graph, edges });
    expect(src).toContain("not flag_door_locked");
  });

  it("renders clock-gte condition", () => {
    const graph = makeGraph();
    const condEdge = makeEdge("cond_c", "hub", "explore", "choice", {
      label: "Escape",
      condition: { op: "clock-gte", clockId: "clock1", value: 3 },
    });
    const edges = [...graph.edges, condEdge];
    const src = renderInkSource({ ...graph, edges });
    expect(src).toContain("clock_clock1 >= 3");
  });

  it("renders clock-filled condition using clock segments count", () => {
    const graph = makeGraph();
    const condEdge = makeEdge("cond_cf", "hub", "explore", "choice", {
      label: "Clock Full",
      condition: { op: "clock-filled", clockId: "clock1" },
    });
    const edges = [...graph.edges, condEdge];
    const src = renderInkSource({ ...graph, edges });
    // clock1 has 4 segments
    expect(src).toContain("clock_clock1 >= 4");
  });
});

describe("renderInkSource — fallback edge", () => {
  it("renders fallback edge as Ink fallback choice (no label, starts with * ->)", () => {
    const fallbackTarget = makeNode("fallback_target", "scene");
    const fallbackEdge = makeEdge("fb_e", "hub", "fallback_target", "fallback");
    const graph = makeGraph();
    const nodes = [...graph.nodes, fallbackTarget];
    const edges = [...graph.edges, fallbackEdge];
    const src = renderInkSource({ ...graph, nodes, edges });
    // Fallback renders as `* ->` followed by target divert
    expect(src).toContain("* ->");
    expect(src).toContain("-> knot_fallback_target");
  });
});

describe("renderInkSource — clock-trigger edges skipped", () => {
  it("does not render clock-trigger edges as Ink choices or diverts", () => {
    const triggerEdge = makeEdge("ct_e", "hub", "combat1", "clock-trigger", {
      clockId: "clock1",
    });
    const graph = makeGraph();
    const edges = [...graph.edges, triggerEdge];
    const src = renderInkSource({ ...graph, edges });
    // hub→combat1 clock-trigger should not add an extra direct divert for clock-trigger
    // The hub knot block should only have its choice edges (Fight, Explore)
    const hubBlock = src.split("=== knot_hub ===")[1]?.split("=== knot_")[0] ?? "";
    // Count occurrences of -> knot_combat1 — should only be 1 (from the choice edge)
    const diverts = (hubBlock.match(/-> knot_combat1/g) ?? []).length;
    expect(diverts).toBe(1);
  });
});

describe("renderInkSource — VAR declarations", () => {
  it("emits VAR declarations for all graph clocks", () => {
    const graph = makeGraph();
    const src = renderInkSource(graph);
    expect(src).toContain("VAR clock_clock1 = 0");
    expect(src).toContain("VAR clock_clock2 = 0");
  });

  it("emits VAR declarations for all graph secrets", () => {
    const graph = makeGraph();
    const src = renderInkSource(graph);
    expect(src).toContain("VAR secret_s1_discovered = false");
    expect(src).toContain("VAR secret_s6_discovered = false");
  });

  it("emits VAR declarations for all graph fronts", () => {
    const graph = makeGraph();
    const src = renderInkSource(graph);
    expect(src).toContain("VAR front_front1_portents = 0");
  });

  it("emits VAR flag declarations for flags referenced in effects", () => {
    const graph = makeGraph();
    // endings use flag-set predicates for 'won' and 'lost'
    // But those are in endings.condition, not edges/nodes — re-test with node effect
    const nodes = graph.nodes.map((n) =>
      n.id === "start"
        ? { ...n, onEnterEffects: [{ op: "set-flag" as const, flag: "arrived" }] }
        : n
    );
    const src = renderInkSource({ ...graph, nodes });
    expect(src).toContain("VAR flag_arrived = false");
  });
});

describe("renderInkSource — on-enter effects", () => {
  it("renders set-flag effect in knot body", () => {
    const graph = makeGraph();
    const nodes = graph.nodes.map((n) =>
      n.id === "start"
        ? { ...n, onEnterEffects: [{ op: "set-flag" as const, flag: "seen_intro" }] }
        : n
    );
    const src = renderInkSource({ ...graph, nodes });
    expect(src).toContain("~ flag_seen_intro = true");
  });

  it("renders tick-clock effect in knot body", () => {
    const graph = makeGraph();
    const nodes = graph.nodes.map((n) =>
      n.id === "scene1"
        ? {
            ...n,
            onEnterEffects: [{ op: "tick-clock" as const, clockId: "clock1", segments: 1 }],
          }
        : n
    );
    const src = renderInkSource({ ...graph, nodes });
    expect(src).toContain("~ clock_clock1 = clock_clock1 + 1");
  });

  it("renders reveal-secret effect in knot body", () => {
    const graph = makeGraph();
    const nodes = graph.nodes.map((n) =>
      n.id === "scene2"
        ? { ...n, onEnterEffects: [{ op: "reveal-secret" as const, secretId: "s1" }] }
        : n
    );
    const src = renderInkSource({ ...graph, nodes });
    expect(src).toContain("~ secret_s1_discovered = true");
  });

  it("renders fire-portent effect in knot body", () => {
    const graph = makeGraph();
    const nodes = graph.nodes.map((n) =>
      n.id === "combat1"
        ? {
            ...n,
            onEnterEffects: [{ op: "fire-portent" as const, frontId: "front1", portentIndex: 0 }],
          }
        : n
    );
    const src = renderInkSource({ ...graph, nodes });
    expect(src).toContain("~ front_front1_portents = front_front1_portents + 1");
  });
});

describe("renderInkSource — Ink reserved char escaping", () => {
  it("escapes ~ in prompt text", () => {
    const graph = makeGraph();
    const nodes = graph.nodes.map((n) =>
      n.id === "start" ? { ...n, prompt: "The storm ~ approaches." } : n
    );
    const src = renderInkSource({ ...graph, nodes });
    expect(src).toContain("The storm \\~ approaches.");
  });

  it("escapes { and } in prompt text", () => {
    const graph = makeGraph();
    const nodes = graph.nodes.map((n) =>
      n.id === "start" ? { ...n, prompt: "Roll {d20}." } : n
    );
    const src = renderInkSource({ ...graph, nodes });
    expect(src).toContain("Roll \\{d20\\}.");
  });

  it("escapes | in prompt text", () => {
    const graph = makeGraph();
    const nodes = graph.nodes.map((n) =>
      n.id === "start" ? { ...n, prompt: "Choose left | right." } : n
    );
    const src = renderInkSource({ ...graph, nodes });
    expect(src).toContain("Choose left \\| right.");
  });

  it("escapes # at start of line in prompt text", () => {
    const graph = makeGraph();
    const nodes = graph.nodes.map((n) =>
      n.id === "start" ? { ...n, prompt: "# This is a header" } : n
    );
    const src = renderInkSource({ ...graph, nodes });
    expect(src).toContain("\\# This is a header");
  });

  it("escapes ~ in choice label", () => {
    const graph = makeGraph();
    const edges = graph.edges.map((e) =>
      e.id === "e4" ? { ...e, label: "Fight ~ boldly" } : e
    );
    const src = renderInkSource({ ...graph, edges });
    expect(src).toContain("[Fight \\~ boldly]");
  });
});

describe("renderInkSource — EXTERNAL declarations", () => {
  it("emits all four EXTERNAL function declarations", () => {
    const graph = makeGraph();
    const src = renderInkSource(graph);
    expect(src).toContain("EXTERNAL roll_skill(skill, dc)");
    expect(src).toContain("EXTERNAL roll_attack(npc_id, target_ac)");
    expect(src).toContain("EXTERNAL pick_character()");
    expect(src).toContain("EXTERNAL advance_spotlight(name)");
  });
});

describe("renderInkSource — ID sanitization", () => {
  it("sanitizes hyphens in node IDs to underscores", () => {
    const hyphenNode = makeNode("my-scene", "scene");
    const graph = makeGraph();
    const nodes = [...graph.nodes, hyphenNode];
    const edges = [...graph.edges, makeEdge("he1", "start", "my-scene", "auto")];
    const src = renderInkSource({ ...graph, nodes, edges });
    expect(src).toContain("=== knot_my_scene ===");
    expect(src).toContain("-> knot_my_scene");
  });
});

describe("renderInkSource — Ink reserved syntax in LLM-generated prose", () => {
  it("escapes -> (divert arrow) in node.prompt so it does not create a divert", () => {
    const graph = makeGraph();
    const nodes = graph.nodes.map((n) =>
      n.id === "start" ? { ...n, prompt: "Drużyna -> port w mgnieniu oka." } : n
    );
    const src = renderInkSource({ ...graph, nodes });
    // The raw -> must not appear in the knot body (it would be treated as a divert)
    const knotBlock = src.split("=== knot_start ===")[1]?.split("=== knot_")[0] ?? "";
    // Escaped form should be present
    expect(knotBlock).toContain("\\-\\>");
    // Raw unescaped -> must NOT appear in the knot body prose
    // (The entry-point divert "-> knot_start" is outside this block, so we check the body)
    const linesInBlock = knotBlock.split("\n").filter((l) => !l.trim().startsWith("~"));
    const hasRawDivert = linesInBlock.some(
      (l) => /(?<!\\)->/.test(l) && !l.trim().startsWith("->")
    );
    expect(hasRawDivert).toBe(false);
  });

  it("escapes * at start of line in node.prompt so it does not create a choice", () => {
    const graph = makeGraph();
    const nodes = graph.nodes.map((n) =>
      n.id === "start"
        ? { ...n, prompt: "* Opcja pierwsza\n* Opcja druga" }
        : n
    );
    const src = renderInkSource({ ...graph, nodes });
    const knotBlock = src.split("=== knot_start ===")[1]?.split("=== knot_")[0] ?? "";
    // Escaped * should be present
    expect(knotBlock).toContain("\\*");
    // No unescaped * at start of line in the prose region
    const hasRawChoice = knotBlock
      .split("\n")
      .some((l) => /^\s*\*(?!\\)/.test(l) && !l.trim().startsWith("* ->") && !l.trim().startsWith("* {") && !l.trim().startsWith("* ["));
    expect(hasRawChoice).toBe(false);
  });

  it("escapes === at start of line in node.prompt so it does not create a knot", () => {
    const graph = makeGraph();
    const nodes = graph.nodes.map((n) =>
      n.id === "start" ? { ...n, prompt: "=== Separator ===" } : n
    );
    const src = renderInkSource({ ...graph, nodes });
    const knotBlock = src.split("=== knot_start ===")[1]?.split("=== knot_")[0] ?? "";
    // Should not contain an unescaped knot separator in the body
    expect(knotBlock).not.toMatch(/^\s*===/m);
    // Escaped form should be present
    expect(knotBlock).toContain("\\===");
  });

  it("uses placeholder text when node.prompt is empty string", () => {
    const graph = makeGraph();
    const nodes = graph.nodes.map((n) =>
      n.id === "start" ? { ...n, prompt: "" } : n
    );
    const src = renderInkSource({ ...graph, nodes });
    const knotBlock = src.split("=== knot_start ===")[1]?.split("=== knot_")[0] ?? "";
    expect(knotBlock).toContain("(brak opisu)");
  });

  it("uses default label when choice edge has empty label", () => {
    const graph = makeGraph();
    const edges = graph.edges.map((e) =>
      e.id === "e4" ? { ...e, label: "" } : e
    );
    const src = renderInkSource({ ...graph, edges });
    // Default label should be rendered as a choice option
    expect(src).toContain("[Kontynuuj]");
  });

  it("escapes // at start of line in node.prompt so it does not become a comment", () => {
    const graph = makeGraph();
    const nodes = graph.nodes.map((n) =>
      n.id === "start" ? { ...n, prompt: "// This looks like a URL fragment" } : n
    );
    const src = renderInkSource({ ...graph, nodes });
    const knotBlock = src.split("=== knot_start ===")[1]?.split("=== knot_")[0] ?? "";
    expect(knotBlock).toContain("\\/\\/");
    // Raw comment must not appear as a comment line
    expect(knotBlock).not.toMatch(/^\s*\/\//m);
  });

  it("escapes <> glue markers in node.prompt", () => {
    const graph = makeGraph();
    const nodes = graph.nodes.map((n) =>
      n.id === "start" ? { ...n, prompt: "Tekst <>dalej." } : n
    );
    const src = renderInkSource({ ...graph, nodes });
    const knotBlock = src.split("=== knot_start ===")[1]?.split("=== knot_")[0] ?? "";
    expect(knotBlock).toContain("\\<\\>");
  });
});
