import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { VersionPicker } from "@/components/version-picker";
import { useStoryDNAStore } from "@/lib/state/story-dna-store";
import { VERSION_SLIDER_DEFAULTS } from "@/lib/schemas/story-dna";
import { DEFAULT_BANNED_PHRASES } from "@/lib/prompts/banned-phrases";

function resetStore() {
  useStoryDNAStore.setState({
    version: "pf2e",
    sliders: { ...VERSION_SLIDER_DEFAULTS.pf2e },
    tags: {
      include: ["Dark Fantasy"],
      exclude: [...DEFAULT_BANNED_PHRASES],
    },
  });
}

describe("VersionPicker", () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it("renders both edition toggles with descriptive labels", () => {
    render(<VersionPicker />);
    expect(screen.getByText(/Pathfinder 1e/i)).toBeDefined();
    expect(screen.getByText(/Pathfinder 2e/i)).toBeDefined();
    expect(screen.getByText(/symulacja fabularna/i)).toBeDefined();
    expect(screen.getByText(/system trzech akcji/i)).toBeDefined();
  });

  it("clicking the PF1e item writes pf1e into the store", () => {
    render(<VersionPicker />);
    fireEvent.click(screen.getByText(/symulacja fabularna/i));
    expect(useStoryDNAStore.getState().version).toBe("pf1e");
  });

  it("clicking the PF1e item resets sliders to PF1e defaults", () => {
    render(<VersionPicker />);
    fireEvent.click(screen.getByText(/symulacja fabularna/i));
    const sliders = useStoryDNAStore.getState().sliders;
    expect(sliders.narrativePacing).toBe(
      VERSION_SLIDER_DEFAULTS.pf1e.narrativePacing
    );
    expect(sliders.tacticalLethality).toBe(
      VERSION_SLIDER_DEFAULTS.pf1e.tacticalLethality
    );
    expect(sliders.npcImprov).toBe(VERSION_SLIDER_DEFAULTS.pf1e.npcImprov);
  });

  it("clicking the PF2e item from pf1e state switches back", () => {
    useStoryDNAStore.getState().setVersion("pf1e");
    render(<VersionPicker />);
    fireEvent.click(screen.getByText(/system trzech akcji/i));
    expect(useStoryDNAStore.getState().version).toBe("pf2e");
  });
});
