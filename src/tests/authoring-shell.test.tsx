import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AuthoringShell } from "@/components/authoring/authoring-shell";
import { makeSession } from "@/tests/factories/session-factory";

// Mock Next.js router — AuthoringShell calls useRouter
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock ReactFlow — heavy Canvas API is not available in jsdom
vi.mock("reactflow", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "react-flow-mock" }, children),
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

describe("AuthoringShell", () => {
  afterEach(cleanup);

  it("renders without crashing", () => {
    const session = makeSession("authoring");
    render(<AuthoringShell session={session} />);
    // Graph canvas placeholder is rendered
    expect(screen.getByTestId("react-flow-mock")).toBeDefined();
  });

  it("shows the session brief tone in the sidebar", () => {
    const session = makeSession("authoring");
    render(<AuthoringShell session={session} />);
    expect(screen.getByText(session.graph!.brief.tone)).toBeDefined();
  });

  it("shows the toolbar mode toggle button", () => {
    const session = makeSession("authoring");
    render(<AuthoringShell session={session} />);
    // In read mode the button shows "Tryb edycji"
    expect(screen.getByText("Tryb edycji")).toBeDefined();
  });
});
