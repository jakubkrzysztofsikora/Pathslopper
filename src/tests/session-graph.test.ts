import { describe, it, expect } from "vitest";
import { SessionGraphSchema } from "@/lib/schemas/session-graph";
import { makeGraph } from "@/tests/factories/graph-factory";
import type { SessionGraph } from "@/lib/schemas/session-graph";

describe("SessionGraphSchema", () => {
  it("round-trip parses a valid graph", () => {
    const graph = makeGraph();
    const result = SessionGraphSchema.safeParse(graph);
    if (!result.success) {
      console.error(result.error.issues);
    }
    expect(result.success).toBe(true);
  });

  it("rejects graph with fewer than 8 nodes", () => {
    const graph = makeGraph({
      nodes: makeGraph().nodes.slice(0, 4),
    });
    const result = SessionGraphSchema.safeParse(graph);
    expect(result.success).toBe(false);
  });

  it("rejects orphaned nodes (no incoming edge, no when predicate)", () => {
    const base = makeGraph();
    // Add an orphan node that has no edges pointing at it
    const orphan = {
      ...base.nodes[0],
      id: "orphan-node",
      kind: "scene" as const,
    };
    const graph: SessionGraph = {
      ...base,
      nodes: [...base.nodes, orphan],
    };
    const result = SessionGraphSchema.safeParse(graph);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(" ");
      expect(messages).toMatch(/orphaned/i);
    }
  });

  it("rejects edge referencing non-existent from-node", () => {
    const base = makeGraph();
    const graph: SessionGraph = {
      ...base,
      edges: [
        ...base.edges,
        {
          id: "bad-edge",
          from: "non-existent-node",
          to: base.nodes[0].id,
          kind: "auto",
          onTraverseEffects: [],
          priority: 0,
        },
      ],
    };
    const result = SessionGraphSchema.safeParse(graph);
    expect(result.success).toBe(false);
  });

  it("rejects clock-trigger edge without clockId", () => {
    const base = makeGraph();
    const graph: SessionGraph = {
      ...base,
      edges: [
        ...base.edges,
        {
          id: "bad-clock-trigger",
          from: base.nodes[0].id,
          to: base.nodes[1].id,
          kind: "clock-trigger",
          onTraverseEffects: [],
          priority: 0,
          // clockId omitted on purpose
        },
      ],
    };
    const result = SessionGraphSchema.safeParse(graph);
    expect(result.success).toBe(false);
  });

  it("rejects graph without a defeat or tpk ending", () => {
    const base = makeGraph();
    const graph: SessionGraph = {
      ...base,
      endings: base.endings.filter(
        (e) => e.category !== "defeat" && e.category !== "tpk"
      ),
    };
    // If filtering removes all endings that could make it fail min count, skip
    if (graph.endings.length < 2) {
      // Replace with 2 victory endings to isolate just the defeat check
      const victoryEndingNode = base.nodes.find((n) => n.kind === "ending");
      if (!victoryEndingNode) return;
      graph.endings = [
        {
          id: "end-v1",
          nodeId: victoryEndingNode.id,
          condition: { op: "flag-set", flag: "done" },
          title: "Victory",
          summary: "Won",
          category: "victory",
          frontOutcomes: {},
        },
        {
          id: "end-v2",
          nodeId: victoryEndingNode.id,
          condition: { op: "flag-set", flag: "done2" },
          title: "Victory2",
          summary: "Won2",
          category: "mixed",
          frontOutcomes: {},
        },
      ];
    }
    const result = SessionGraphSchema.safeParse(graph);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(" ");
      expect(messages).toMatch(/defeat|un-losable/i);
    }
  });

  it("rejects Three-Clue Rule violation (conclusionTag with < 3 secrets)", () => {
    const base = makeGraph();
    // Replace secrets with only 2 for one tag
    const graph: SessionGraph = {
      ...base,
      secrets: [
        { id: "s1", text: "Secret 1", conclusionTag: "tag-a", discovered: false, delivery: "npc-dialog", requires: [] },
        { id: "s2", text: "Secret 2", conclusionTag: "tag-a", discovered: false, delivery: "document", requires: [] },
        // tag-a only has 2 — violates Three-Clue Rule
        { id: "s3", text: "Secret 3", conclusionTag: "tag-b", discovered: false, delivery: "environmental", requires: [] },
        { id: "s4", text: "Secret 4", conclusionTag: "tag-b", discovered: false, delivery: "skill-check", requires: [] },
        { id: "s5", text: "Secret 5", conclusionTag: "tag-b", discovered: false, delivery: "npc-dialog", requires: [] },
        { id: "s6", text: "Secret 6", conclusionTag: "tag-b", discovered: false, delivery: "document", requires: [] },
      ],
    };
    const result = SessionGraphSchema.safeParse(graph);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(" ");
      expect(messages).toMatch(/Three-Clue Rule|conclusionTag/i);
    }
  });
});
