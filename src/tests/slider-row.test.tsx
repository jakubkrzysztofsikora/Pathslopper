import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SliderRow } from "@/components/story-dna/slider-row";

describe("SliderRow", () => {
  afterEach(cleanup);

  it("renders the label, description, and numeric value", () => {
    const onValueChange = vi.fn();
    render(
      <SliderRow
        label="Narrative Pacing"
        description="Controls story beat ratio."
        value={42}
        onValueChange={onValueChange}
      />
    );
    expect(screen.getByText("Narrative Pacing")).toBeDefined();
    expect(screen.getByText("Controls story beat ratio.")).toBeDefined();
    expect(screen.getByText("42")).toBeDefined();
  });

  it("exposes an accessible slider with aria-label matching the label prop", () => {
    render(
      <SliderRow
        label="Tactical Lethality"
        description="Threat level."
        value={55}
        onValueChange={() => {}}
      />
    );
    const slider = screen.getByRole("slider", { name: /Tactical Lethality/i });
    expect(slider).toBeDefined();
  });

  it("displays the updated value when re-rendered with a new value prop", () => {
    const { rerender } = render(
      <SliderRow
        label="NPC Improv"
        description="Improvisation freedom."
        value={25}
        onValueChange={() => {}}
      />
    );
    expect(screen.getByText("25")).toBeDefined();
    rerender(
      <SliderRow
        label="NPC Improv"
        description="Improvisation freedom."
        value={80}
        onValueChange={() => {}}
      />
    );
    expect(screen.getByText("80")).toBeDefined();
  });
});
