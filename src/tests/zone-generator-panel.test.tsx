import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ZoneGeneratorPanel } from "@/components/zones/zone-generator-panel";
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

const validZone = {
  id: "zone-1",
  name: "Flooded Corridor",
  terrain: "underground",
  cover: [
    {
      id: "pillar",
      name: "Stone Pillar",
      coverBonus: 2,
      description: "Crumbling pillar.",
    },
  ],
  elevation: 0,
  hazards: ["ankle-deep water"],
  lighting: "dim",
  pf2eActionCost: 1,
};

describe("ZoneGeneratorPanel", () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("has default biome and intent populated", () => {
    render(<ZoneGeneratorPanel />);
    const biome = screen.getByTestId("zone-biome-input") as HTMLInputElement;
    const intent = screen.getByTestId("zone-intent-input") as HTMLInputElement;
    expect(biome.value.length).toBeGreaterThan(0);
    expect(intent.value.length).toBeGreaterThan(0);
  });

  it("disables Generate button when biome or intent is empty", () => {
    render(<ZoneGeneratorPanel />);
    const biome = screen.getByTestId("zone-biome-input");
    fireEvent.change(biome, { target: { value: "" } });
    const button = screen.getByTestId(
      "zone-generate-button"
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("POSTs dna snapshot and seed, renders zone result on success", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        markdown: "The corridor reeks of damp stone.\n\n```json\n{}\n```",
        zone: validZone,
        warnings: [],
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<ZoneGeneratorPanel />);
    fireEvent.change(screen.getByTestId("zone-biome-input"), {
      target: { value: "abyssal cavern" },
    });
    fireEvent.change(screen.getByTestId("zone-intent-input"), {
      target: { value: "cultist ritual" },
    });
    fireEvent.click(screen.getByTestId("zone-generate-button"));

    await waitFor(() => {
      expect(screen.getByTestId("zone-result")).toBeDefined();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/zones/generate",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.seed.biome).toBe("abyssal cavern");
    expect(body.seed.encounterIntent).toBe("cultist ritual");
    expect(body.dna.version).toBe("pf2e");
    expect(body.dna.sliders.narrativePacing).toBe(
      VERSION_SLIDER_DEFAULTS.pf2e.narrativePacing
    );

    expect(screen.getByText("Flooded Corridor")).toBeDefined();
  });

  it("renders warnings and error message when API returns non-ok", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        ok: false,
        error: "Zone JSON could not be extracted or validated.",
        warnings: ["Banned phrases persisted after retry: moreover."],
        markdown: "raw markdown",
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<ZoneGeneratorPanel />);
    fireEvent.click(screen.getByTestId("zone-generate-button"));

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("could not be extracted");
      expect(alert.textContent).toContain("moreover");
    });
  });

  it("shows loading state while request is pending", async () => {
    let resolveFn: ((v: unknown) => void) | undefined;
    const fetchSpy = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveFn = resolve;
      })
    );
    vi.stubGlobal("fetch", fetchSpy);

    render(<ZoneGeneratorPanel />);
    fireEvent.click(screen.getByTestId("zone-generate-button"));

    await waitFor(() => {
      const button = screen.getByTestId(
        "zone-generate-button"
      ) as HTMLButtonElement;
      expect(button.textContent).toContain("Generating");
      expect(button.disabled).toBe(true);
    });

    // Resolve and wait for success render to clear pending state and avoid act warning.
    resolveFn?.({
      ok: true,
      json: async () => ({
        ok: true,
        markdown: "x",
        zone: validZone,
        warnings: [],
      }),
    });
    await waitFor(() => {
      expect(screen.getByTestId("zone-result")).toBeDefined();
    });
  });
});
