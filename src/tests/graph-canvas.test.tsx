import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { GraphCanvas } from "@/components/authoring/graph-canvas";
import { makeGraph } from "@/tests/factories/graph-factory";

// Mock ReactFlow — Canvas API not available in jsdom
vi.mock("reactflow", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({
      nodes,
      children,
    }: {
      nodes?: { id: string }[];
      children?: React.ReactNode;
    }) =>
      React.createElement(
        "div",
        { "data-testid": "react-flow" },
        nodes?.map((n: { id: string }) =>
          React.createElement("div", { key: n.id, "data-testid": `rf-node-${n.id}` })
        ),
        children
      ),
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    MarkerType: { ArrowClosed: "arrowclosed" },
    Position: { Left: "left", Right: "right" },
    Handle: () => null,
    useReactFlow: () => ({ fitView: vi.fn() }),
  };
});

// elkjs is async and runs layout — mock it to return passthrough positions
vi.mock("elkjs/lib/elk.bundled.js", () => ({
  default: class {
    async layout(graph: {
      children?: Array<{ id: string; children?: Array<{ id: string }> }>;
      edges?: unknown[];
    }) {
      return {
        ...graph,
        children: (graph.children ?? []).map(
          (group: { id: string; children?: Array<{ id: string }> }) => ({
            ...group,
            x: 0,
            y: 0,
            width: 400,
            height: 300,
            children: (group.children ?? []).map(
              (child: { id: string }) => ({
                ...child,
                x: 0,
                y: 0,
              })
            ),
          })
        ),
      };
    }
  },
}));

describe("GraphCanvas", () => {
  afterEach(cleanup);

  it("renders the ReactFlow container", () => {
    const graph = makeGraph();
    render(
      <GraphCanvas graph={graph} selectedNodeId={null} onSelectNode={vi.fn()} />
    );
    expect(screen.getByTestId("react-flow")).toBeDefined();
  });
});
