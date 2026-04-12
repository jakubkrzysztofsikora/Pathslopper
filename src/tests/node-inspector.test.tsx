import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NodeInspector } from "@/components/authoring/node-inspector";
import { makeGraph } from "@/tests/factories/graph-factory";

describe("NodeInspector", () => {
  afterEach(cleanup);

  it("shows a no-selection placeholder when node is null", () => {
    render(
      <NodeInspector
        node={null}
        npcs={[]}
        locations={[]}
        editMode={false}
        onUpdate={vi.fn()}
        onRegen={vi.fn()}
      />
    );
    // The "select a node" placeholder text
    expect(screen.getByText(/kliknij węzeł/i)).toBeDefined();
  });

  it("in read mode all inputs are disabled", () => {
    const graph = makeGraph();
    const node = graph.nodes[0];
    render(
      <NodeInspector
        node={node}
        npcs={graph.npcs}
        locations={graph.locations}
        editMode={false}
        onUpdate={vi.fn()}
        onRegen={vi.fn()}
      />
    );
    const inputs = screen.getAllByRole("textbox");
    // All text inputs should be disabled in read mode
    for (const input of inputs) {
      expect((input as HTMLInputElement).disabled).toBe(true);
    }
  });

  it("in edit mode inputs are enabled", () => {
    const graph = makeGraph();
    const node = graph.nodes[0];
    render(
      <NodeInspector
        node={node}
        npcs={graph.npcs}
        locations={graph.locations}
        editMode={true}
        onUpdate={vi.fn()}
        onRegen={vi.fn()}
      />
    );
    const inputs = screen.getAllByRole("textbox");
    // At least the title input should be enabled
    const enabledInputs = inputs.filter(
      (i) => !(i as HTMLInputElement).disabled
    );
    expect(enabledInputs.length).toBeGreaterThan(0);
  });

  it("renders the node title in the inspector", () => {
    const graph = makeGraph();
    const node = graph.nodes[0];
    render(
      <NodeInspector
        node={node}
        npcs={graph.npcs}
        locations={graph.locations}
        editMode={false}
        onUpdate={vi.fn()}
        onRegen={vi.fn()}
      />
    );
    expect(screen.getByDisplayValue(node.title)).toBeDefined();
  });
});
