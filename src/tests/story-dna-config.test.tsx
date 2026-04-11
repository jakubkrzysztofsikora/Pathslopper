import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { StoryDNAConfig } from "@/components/story-dna/story-dna-config";
import { useStoryDNAStore } from "@/lib/state/story-dna-store";
import { VERSION_SLIDER_DEFAULTS } from "@/lib/schemas/story-dna";
import { DEFAULT_BANNED_PHRASES } from "@/lib/prompts/banned-phrases";

function resetStore() {
  useStoryDNAStore.setState({
    version: "pf2e",
    sliders: { ...VERSION_SLIDER_DEFAULTS.pf2e },
    tags: {
      include: ["Dark Fantasy", "Political Intrigue"],
      exclude: [...DEFAULT_BANNED_PHRASES],
    },
  });
}

describe("StoryDNAConfig", () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it("renders the three slider labels", () => {
    render(<StoryDNAConfig />);
    expect(screen.getByText("Tempo narracji")).toBeDefined();
    expect(screen.getByText("Taktyczna śmiertelność")).toBeDefined();
    expect(screen.getByText("Improwizacja BN")).toBeDefined();
  });

  it("displays the calibration label for the current version", () => {
    render(<StoryDNAConfig />);
    expect(screen.getByText(/Skalibrowane dla Pathfinder 2e/i)).toBeDefined();
  });

  it("switches the calibration label when the store version changes", () => {
    const { rerender } = render(<StoryDNAConfig />);
    act(() => {
      useStoryDNAStore.getState().setVersion("pf1e");
    });
    rerender(<StoryDNAConfig />);
    expect(screen.getByText(/Skalibrowane dla Pathfinder 1e/i)).toBeDefined();
  });

  it("renders include and exclude tag sections", () => {
    render(<StoryDNAConfig />);
    expect(screen.getByText("Motywy do włączenia")).toBeDefined();
    expect(screen.getByText(/Filtr slopa/i)).toBeDefined();
  });

  it("pre-seeds exclude tags with all default banned phrases", () => {
    render(<StoryDNAConfig />);
    for (const phrase of DEFAULT_BANNED_PHRASES) {
      expect(screen.getByText(phrase)).toBeDefined();
    }
  });

  it("adding a new include tag via FilterTags updates the store", () => {
    render(<StoryDNAConfig />);
    const input = screen.getByPlaceholderText(/Dodaj motyw/i);
    fireEvent.change(input, { target: { value: "Powstanie nieumarłych" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(useStoryDNAStore.getState().tags.include).toContain(
      "Powstanie nieumarłych"
    );
  });
});
