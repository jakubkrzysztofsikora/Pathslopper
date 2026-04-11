import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { PlayerInputConsole } from "@/components/interaction/player-input-console";
import { useStoryDNAStore } from "@/lib/state/story-dna-store";
import { VERSION_SLIDER_DEFAULTS } from "@/lib/schemas/story-dna";
import { DEFAULT_BANNED_PHRASES } from "@/lib/prompts/banned-phrases";
import type { SessionState } from "@/lib/schemas/session";

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

const fakeSession: SessionState = {
  id: "abcdefgh12345678",
  version: "pf2e",
  createdAt: "2026-04-09T00:00:00.000Z",
  updatedAt: "2026-04-09T00:00:00.000Z",
  turns: [],
  characters: [],
  activeOverride: null,
};

const successResult = {
  intent: {
    version: "pf2e",
    rawInput: "Wymierzam długim mieczem w najbliższego goblina.",
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
  summary: "Longsword na cel: goblin: wyrzucono 20 — sukces.",
};

/**
 * Route-aware fetch mock. With the overhaul the console no longer hits
 * /api/sessions itself — the wizard owns session creation — so this
 * helper only dispatches resolve / narrate.
 */
interface MockResponses {
  resolve?: unknown;
  narrate?: unknown;
}

function mockFetchByRoute(responses: MockResponses) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    void _init;
    if (url === "/api/interaction/resolve") {
      return {
        ok: true,
        json: async () =>
          responses.resolve ?? {
            ok: true,
            result: successResult,
            session: fakeSession,
          },
      } as Response;
    }
    if (url === "/api/interaction/narrate") {
      return {
        ok: true,
        json: async () =>
          responses.narrate ?? {
            ok: true,
            markdown: "Wchodzisz w wilgotny kamień.",
            worldStateHash: "abc12345",
            warnings: [],
            session: fakeSession,
          },
      } as Response;
    }
    throw new Error(`Unexpected fetch URL in test: ${url}`);
  });
}

describe("PlayerInputConsole", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the heading, textarea, modifier, DC, and resolve button", () => {
    render(
      <PlayerInputConsole sessionId={fakeSession.id} initialSession={fakeSession} />
    );
    expect(screen.getByText(/Akcja gracza/i)).toBeDefined();
    expect(screen.getByTestId("player-input-textarea")).toBeDefined();
    expect(screen.getByTestId("player-input-modifier")).toBeDefined();
    expect(screen.getByTestId("player-input-dc")).toBeDefined();
    expect(screen.getByTestId("player-input-resolve-button")).toBeDefined();
    expect(screen.getByTestId("player-input-narrate-button")).toBeDefined();
    expect(screen.getByTestId("session-id-display")).toBeDefined();
  });

  it("disables the resolve button when the textarea is empty", () => {
    render(
      <PlayerInputConsole sessionId={fakeSession.id} initialSession={fakeSession} />
    );
    const button = screen.getByTestId(
      "player-input-resolve-button"
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("POSTs rawInput + version + overrides and renders the audit breakdown", async () => {
    const fetchSpy = mockFetchByRoute({});
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <PlayerInputConsole sessionId={fakeSession.id} initialSession={fakeSession} />
    );
    fireEvent.change(screen.getByTestId("player-input-textarea"), {
      target: { value: "Atakuję goblina mieczem." },
    });
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

    // The only call the console makes is the resolve with the injected sessionId.
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/interaction/resolve");
    const resolveBody = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(resolveBody.version).toBe("pf2e");
    expect(resolveBody.overrideModifier).toBe(5);
    expect(resolveBody.overrideDc).toBe(15);
    expect(resolveBody.sessionId).toBe(fakeSession.id);

    // Audit breakdown rendered verbatim.
    expect(screen.getByTestId("player-input-audit").textContent).toBe(
      successResult.roll.breakdown
    );
    expect(screen.getByTestId("player-input-degree-badge").textContent).toMatch(
      /sukces/i
    );
  });

  it("omits overrideModifier and overrideDc from the resolve payload when inputs are empty", async () => {
    const fetchSpy = mockFetchByRoute({});
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <PlayerInputConsole sessionId={fakeSession.id} initialSession={fakeSession} />
    );
    fireEvent.change(screen.getByTestId("player-input-textarea"), {
      target: { value: "Opisuję scenę." },
    });
    fireEvent.click(screen.getByTestId("player-input-resolve-button"));

    await waitFor(() => {
      const resolveCall = fetchSpy.mock.calls.find(
        (c) => c[0] === "/api/interaction/resolve"
      );
      expect(resolveCall).toBeDefined();
    });
    const resolveCall = fetchSpy.mock.calls.find(
      (c) => c[0] === "/api/interaction/resolve"
    )!;
    const body = JSON.parse(String(resolveCall[1]?.body));
    expect(body.overrideModifier).toBeUndefined();
    expect(body.overrideDc).toBeUndefined();
  });

  it("renders the API error message when the resolve request fails", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: false,
      json: async () => ({ ok: false, error: "Upstream model call failed." }),
    } as Response));
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <PlayerInputConsole sessionId={fakeSession.id} initialSession={fakeSession} />
    );
    fireEvent.change(screen.getByTestId("player-input-textarea"), {
      target: { value: "Robię coś." },
    });
    fireEvent.click(screen.getByTestId("player-input-resolve-button"));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Upstream model call failed."
      );
    });
  });

  it("Narrate Scene button calls /api/interaction/narrate with the current sessionId", async () => {
    const sessionWithTurns: SessionState = {
      ...fakeSession,
      turns: [
        {
          kind: "narration",
          at: "2026-04-09T00:01:00.000Z",
          markdown: "Stoisz w wilgotnym korytarzu.",
          worldStateHash: "abc12345",
        },
      ],
    };
    const fetchSpy = mockFetchByRoute({
      narrate: {
        ok: true,
        markdown: "Stoisz w wilgotnym korytarzu.",
        worldStateHash: "abc12345",
        warnings: [],
        session: sessionWithTurns,
      },
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <PlayerInputConsole sessionId={fakeSession.id} initialSession={fakeSession} />
    );
    fireEvent.click(screen.getByTestId("player-input-narrate-button"));

    await waitFor(() => {
      expect(screen.getByTestId("session-log")).toBeDefined();
    });

    expect(fetchSpy.mock.calls[0][0]).toBe("/api/interaction/narrate");
    const narrateBody = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(narrateBody.sessionId).toBe(fakeSession.id);
    expect(narrateBody.persist).toBe(true);

    expect(screen.getByTestId("session-turn-0").textContent).toContain(
      "wilgotnym korytarzu"
    );
  });

  it("shows the empty-session log hint when no turns are present", () => {
    render(
      <PlayerInputConsole sessionId={fakeSession.id} initialSession={fakeSession} />
    );
    expect(screen.getByTestId("session-log-empty")).toBeDefined();
  });
});
