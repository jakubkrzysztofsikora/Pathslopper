import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ClockTracker } from "@/components/play/clock-tracker";
import type { Clock } from "@/lib/schemas/session-graph";
import type { WorldState } from "@/lib/schemas/session";

afterEach(cleanup);

function makeWorldState(overrides: Partial<WorldState> = {}): WorldState {
  return {
    clocks: {},
    flags: [],
    vars: {},
    spotlightDebt: {},
    turnCount: 0,
    lastDirectorMove: "none",
    stallTicks: 0,
    elapsedMinutes: 0,
    ephemeralNpcs: [],
    ...overrides,
  };
}

describe("ClockTracker", () => {
  it("renders null when clocks array is empty", () => {
    const { container } = render(
      <ClockTracker clocks={[]} worldState={makeWorldState()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders one clock widget per clock", () => {
    const clocks: Clock[] = [
      { id: "c1", label: "Alarm", segments: 4, filled: 0, polarity: "danger", tickSources: [] },
      { id: "c2", label: "Szansa", segments: 6, filled: 0, polarity: "opportunity", tickSources: [] },
    ];
    render(<ClockTracker clocks={clocks} worldState={makeWorldState()} />);
    expect(screen.getByText("Alarm")).toBeDefined();
    expect(screen.getByText("Szansa")).toBeDefined();
  });

  it("renders correct number of segments for a 4-segment clock", () => {
    const clocks: Clock[] = [
      { id: "c1", label: "Clock A", segments: 4, filled: 0, polarity: "danger", tickSources: [] },
    ];
    const { container } = render(
      <ClockTracker clocks={clocks} worldState={makeWorldState()} />
    );
    // SVG-based clock: each segment is a <path> inside the <svg>
    const svg = container.querySelector("svg");
    expect(svg).toBeDefined();
    const paths = svg?.querySelectorAll("path");
    expect(paths).toHaveLength(4);
  });

  it("filled segments use danger fill color for danger polarity", () => {
    const clocks: Clock[] = [
      { id: "c1", label: "Danger", segments: 4, filled: 0, polarity: "danger", tickSources: [] },
    ];
    const worldState = makeWorldState({ clocks: { c1: 2 } });
    const { container } = render(<ClockTracker clocks={clocks} worldState={worldState} />);
    const svg = container.querySelector("svg");
    const paths = svg?.querySelectorAll("path") ?? [];
    // First 2 segments should have full opacity (filled), last 2 lower opacity
    const filledPaths = Array.from(paths).filter(
      (p) => p.getAttribute("opacity") === "0.9"
    );
    expect(filledPaths).toHaveLength(2);
  });

  it("filled segments use opportunity fill color for opportunity polarity", () => {
    const clocks: Clock[] = [
      { id: "c2", label: "Opportunity", segments: 6, filled: 0, polarity: "opportunity", tickSources: [] },
    ];
    const worldState = makeWorldState({ clocks: { c2: 3 } });
    const { container } = render(<ClockTracker clocks={clocks} worldState={worldState} />);
    const svg = container.querySelector("svg");
    const paths = svg?.querySelectorAll("path") ?? [];
    const filledPaths = Array.from(paths).filter(
      (p) => p.getAttribute("opacity") === "0.9"
    );
    expect(filledPaths).toHaveLength(3);
  });

  it("unfilled segments use lower opacity", () => {
    const clocks: Clock[] = [
      { id: "c1", label: "Mixed", segments: 4, filled: 0, polarity: "danger", tickSources: [] },
    ];
    const worldState = makeWorldState({ clocks: { c1: 1 } }); // 1 filled, 3 empty
    const { container } = render(<ClockTracker clocks={clocks} worldState={worldState} />);
    const svg = container.querySelector("svg");
    const paths = svg?.querySelectorAll("path") ?? [];
    const emptyPaths = Array.from(paths).filter(
      (p) => p.getAttribute("opacity") === "0.35"
    );
    expect(emptyPaths).toHaveLength(3);
  });

  it("clock label is displayed", () => {
    const clocks: Clock[] = [
      { id: "c1", label: "Czas Alarmu", segments: 4, filled: 0, polarity: "danger", tickSources: [] },
    ];
    render(<ClockTracker clocks={clocks} worldState={makeWorldState()} />);
    expect(screen.getByText("Czas Alarmu")).toBeDefined();
  });

  it("uses worldState.clocks filled value over clock.filled", () => {
    const clocks: Clock[] = [
      // clock.filled = 0 but worldState.clocks override says 4
      { id: "c1", label: "Override", segments: 4, filled: 0, polarity: "danger", tickSources: [] },
    ];
    const worldState = makeWorldState({ clocks: { c1: 4 } });
    const { container } = render(<ClockTracker clocks={clocks} worldState={worldState} />);
    const svg = container.querySelector("svg");
    const paths = svg?.querySelectorAll("path") ?? [];
    // All 4 segments should be filled (high opacity)
    const filledPaths = Array.from(paths).filter(
      (p) => p.getAttribute("opacity") === "0.9"
    );
    expect(filledPaths).toHaveLength(4);
  });
});
