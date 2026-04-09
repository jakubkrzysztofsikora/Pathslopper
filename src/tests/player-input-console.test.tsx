import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { PlayerInputConsole } from "@/components/interaction/player-input-console";
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

const successResult = {
  intent: {
    version: "pf2e",
    rawInput: "I swing my longsword at the nearest goblin.",
    action: "strike",
    skillOrAttack: "Longsword",
    target: "goblin",
    description: "Strike the goblin with a longsword.",
    actionCost: 1,
    modifier: 5,
    dc: 15,
  },
  roll: {
    formula: "1d20 + 5 Longsword",
    rolls: [15],
    modifiers: [{ label: "Longsword", value: 5 }],
    total: 20,
    breakdown: "1d20(15) + 5 Longsword = 20 vs DC 15 — SUCCESS",
    dc: 15,
    degreeOfSuccess: "success",
  },
  outcome: "resolved",
  summary: "Longsword against goblin: rolled 20 — success.",
};

describe("PlayerInputConsole", () => {
  beforeEach(resetStore);
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the heading, textarea, modifier, DC, and resolve button", () => {
    render(<PlayerInputConsole />);
    expect(screen.getByText(/Audit the Math/i)).toBeDefined();
    expect(screen.getByTestId("player-input-textarea")).toBeDefined();
    expect(screen.getByTestId("player-input-modifier")).toBeDefined();
    expect(screen.getByTestId("player-input-dc")).toBeDefined();
    expect(screen.getByTestId("player-input-resolve-button")).toBeDefined();
  });

  it("disables the resolve button when the textarea is empty", () => {
    render(<PlayerInputConsole />);
    const textarea = screen.getByTestId("player-input-textarea");
    fireEvent.change(textarea, { target: { value: "" } });
    const button = screen.getByTestId(
      "player-input-resolve-button"
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("POSTs rawInput + version + overrides and renders the audit breakdown", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: successResult }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<PlayerInputConsole />);
    fireEvent.change(screen.getByTestId("player-input-modifier"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByTestId("player-input-dc"), {
      target: { value: "15" },
    });
    fireEvent.click(screen.getByTestId("player-input-resolve-button"));

    await waitFor(() => {
      expect(screen.getByTestId("player-input-audit")).toBeDefined();
    });

    // Fetch body shape.
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/interaction/resolve",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.version).toBe("pf2e");
    expect(body.overrideModifier).toBe(5);
    expect(body.overrideDc).toBe(15);

    // Audit breakdown rendered verbatim.
    expect(screen.getByTestId("player-input-audit").textContent).toBe(
      successResult.roll.breakdown
    );

    // Degree badge rendered.
    const badge = screen.getByTestId("player-input-degree-badge");
    expect(badge.textContent).toMatch(/success/i);
  });

  it("omits overrideModifier and overrideDc from the payload when inputs are empty", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: successResult }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<PlayerInputConsole />);
    fireEvent.change(screen.getByTestId("player-input-modifier"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByTestId("player-input-dc"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByTestId("player-input-resolve-button"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.overrideModifier).toBeUndefined();
    expect(body.overrideDc).toBeUndefined();
  });

  it("renders the API error message when the request fails", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, error: "Upstream model call failed." }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<PlayerInputConsole />);
    fireEvent.click(screen.getByTestId("player-input-resolve-button"));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Upstream model call failed."
      );
    });
  });
});
