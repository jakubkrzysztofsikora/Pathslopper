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
    // Each segment is a div — find segment divs inside the clock widget
    const segmentDivs = container.querySelectorAll(".h-4.w-4");
    expect(segmentDivs).toHaveLength(4);
  });

  it("filled segments use danger color (red) for danger polarity", () => {
    const clocks: Clock[] = [
      { id: "c1", label: "Danger", segments: 4, filled: 0, polarity: "danger", tickSources: [] },
    ];
    const worldState = makeWorldState({ clocks: { c1: 2 } });
    const { container } = render(<ClockTracker clocks={clocks} worldState={worldState} />);
    const filled = container.querySelectorAll(".bg-red-500");
    expect(filled).toHaveLength(2);
  });

  it("filled segments use opportunity color (emerald) for opportunity polarity", () => {
    const clocks: Clock[] = [
      { id: "c2", label: "Opportunity", segments: 6, filled: 0, polarity: "opportunity", tickSources: [] },
    ];
    const worldState = makeWorldState({ clocks: { c2: 3 } });
    const { container } = render(<ClockTracker clocks={clocks} worldState={worldState} />);
    const filled = container.querySelectorAll(".bg-emerald-500");
    expect(filled).toHaveLength(3);
  });

  it("unfilled segments use zinc (empty) background", () => {
    const clocks: Clock[] = [
      { id: "c1", label: "Mixed", segments: 4, filled: 0, polarity: "danger", tickSources: [] },
    ];
    const worldState = makeWorldState({ clocks: { c1: 1 } }); // 1 filled, 3 empty
    const { container } = render(<ClockTracker clocks={clocks} worldState={worldState} />);
    const empty = container.querySelectorAll(".bg-zinc-800");
    expect(empty).toHaveLength(3);
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
    // All 4 segments should be filled (red)
    const filled = container.querySelectorAll(".bg-red-500");
    expect(filled).toHaveLength(4);
  });
});
