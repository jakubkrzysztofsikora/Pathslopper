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

const fakeSession = {
  id: "abcdefgh12345678",
  version: "pf2e",
  createdAt: "2026-04-09T00:00:00.000Z",
  updatedAt: "2026-04-09T00:00:00.000Z",
  turns: [],
};

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

/**
 * Route-aware fetch mock. The PlayerInputConsole now calls /api/sessions
 * before /api/interaction/resolve on first use, so a single flat mock
 * would misattribute calls. This helper dispatches by URL.
 */
interface MockResponses {
  createSession?: unknown;
  resolve?: unknown;
  narrate?: unknown;
}

function mockFetchByRoute(responses: MockResponses) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    void _init;
    if (url === "/api/sessions") {
      return {
        ok: true,
        json: async () =>
          responses.createSession ?? { ok: true, session: fakeSession },
      } as Response;
    }
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
            markdown: "You step into damp stone.",
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
    if (typeof window !== "undefined") {
      window.sessionStorage.clear();
    }
  });
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
    expect(screen.getByTestId("player-input-narrate-button")).toBeDefined();
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

  it("creates a session then POSTs rawInput + version + overrides and renders the audit breakdown", async () => {
    const fetchSpy = mockFetchByRoute({});
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

    // First call must be session creation.
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/sessions");
    const createBody = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(createBody.version).toBe("pf2e");

    // Second call is the resolve with the new sessionId attached.
    expect(fetchSpy.mock.calls[1][0]).toBe("/api/interaction/resolve");
    const resolveBody = JSON.parse(String(fetchSpy.mock.calls[1][1]?.body));
    expect(resolveBody.version).toBe("pf2e");
    expect(resolveBody.overrideModifier).toBe(5);
    expect(resolveBody.overrideDc).toBe(15);
    expect(resolveBody.sessionId).toBe(fakeSession.id);

    // Audit breakdown rendered verbatim.
    expect(screen.getByTestId("player-input-audit").textContent).toBe(
      successResult.roll.breakdown
    );
    expect(screen.getByTestId("player-input-degree-badge").textContent).toMatch(
      /success/i
    );
  });

  it("omits overrideModifier and overrideDc from the resolve payload when inputs are empty", async () => {
    const fetchSpy = mockFetchByRoute({});
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
    const fetchSpy = vi.fn(async (url: string) => {
      if (url === "/api/sessions") {
        return {
          ok: true,
          json: async () => ({ ok: true, session: fakeSession }),
        } as Response;
      }
      return {
        ok: false,
        json: async () => ({ ok: false, error: "Upstream model call failed." }),
      } as Response;
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

  it("Narrate Scene button calls /api/interaction/narrate with the current sessionId", async () => {
    const sessionWithTurns = {
      ...fakeSession,
      turns: [
        {
          kind: "narration",
          at: "2026-04-09T00:01:00.000Z",
          markdown: "You stand in a damp corridor.",
          worldStateHash: "abc12345",
        },
      ],
    };
    const fetchSpy = mockFetchByRoute({
      narrate: {
        ok: true,
        markdown: "You stand in a damp corridor.",
        worldStateHash: "abc12345",
        warnings: [],
        session: sessionWithTurns,
      },
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<PlayerInputConsole />);
    fireEvent.click(screen.getByTestId("player-input-narrate-button"));

    await waitFor(() => {
      expect(screen.getByTestId("session-log")).toBeDefined();
    });

    // First call: session create. Second: narrate.
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/sessions");
    expect(fetchSpy.mock.calls[1][0]).toBe("/api/interaction/narrate");
    const narrateBody = JSON.parse(String(fetchSpy.mock.calls[1][1]?.body));
    expect(narrateBody.sessionId).toBe(fakeSession.id);
    expect(narrateBody.persist).toBe(true);

    // Session log shows the narration turn.
    expect(screen.getByTestId("session-turn-0").textContent).toContain(
      "damp corridor"
    );
  });

  it("reset button clears sessionId and session log", async () => {
    const fetchSpy = mockFetchByRoute({
      narrate: {
        ok: true,
        markdown: "scene",
        worldStateHash: "abc",
        warnings: [],
        session: {
          ...fakeSession,
          turns: [
            {
              kind: "narration",
              at: "2026-04-09T00:01:00.000Z",
              markdown: "scene",
              worldStateHash: "abc",
            },
          ],
        },
      },
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<PlayerInputConsole />);
    fireEvent.click(screen.getByTestId("player-input-narrate-button"));
    await waitFor(() => {
      expect(screen.getByTestId("session-reset-button")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("session-reset-button"));
    expect(screen.queryByTestId("session-log")).toBeNull();
    expect(screen.queryByTestId("session-id-display")).toBeNull();
  });
});
