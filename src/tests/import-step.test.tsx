import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { ImportStep } from "@/components/sessions/import-step";

// next/navigation is not mockable via environment like jsdom — use vi.mock.
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

afterEach(() => {
  cleanup();
  pushMock.mockReset();
  vi.restoreAllMocks();
});

beforeEach(() => {
  pushMock.mockReset();
});

describe("ImportStep", () => {
  it("renders a paste textarea and a disabled submit while empty", () => {
    render(<ImportStep />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).not.toBeNull();
    const submit = screen.getByRole("button", { name: /importuj|import/i });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a character counter that warns near the 50k cap", () => {
    render(<ImportStep />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "hello" } });
    expect(screen.getByText(/5\s*\/\s*50[\s]*000/i)).not.toBeNull();
  });

  it("enables submit once content is typed", () => {
    render(<ImportStep />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "# my session\n\n## Scenes\n- One\n" } });
    const submit = screen.getByRole("button", { name: /importuj|import/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it("creates session + imports + redirects to authoring on happy path", async () => {
    const fetchMock = vi.fn()
      // POST /api/sessions → create
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, id: "sess-abc123", phase: "brief" }),
      })
      // POST /api/sessions/sess-abc123/import → success
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          graph: { id: "sess-abc123" },
          warnings: [],
          pendingConsent: { clocks: false, fronts: false, endings: false },
          repairs: [],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<ImportStep />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "# Session\n\n## Scenes\n- One\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: /importuj|import/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/sesja/sess-abc123/przygotowanie"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/sessions");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/sessions/sess-abc123/import");
  });

  it("surfaces warnings (looks-like-recap, paizo-ip) after import", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, id: "sess-xyz", phase: "brief" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          graph: { id: "sess-xyz" },
          warnings: ["looks-like-recap", "paizo-ip"],
          pendingConsent: { clocks: true, fronts: true, endings: true },
          repairs: [],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<ImportStep />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "stuff" } });
    fireEvent.click(screen.getByRole("button", { name: /importuj|import/i }));

    const matches = await screen.findAllByText(/recap|Paizo|rekap/i);
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("shows a server error message when /import fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, id: "sess-err", phase: "brief" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ ok: false, stage: "C", error: "stage C failed" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<ImportStep />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "stuff" } });
    fireEvent.click(screen.getByRole("button", { name: /importuj|import/i }));

    await screen.findByText(/stage C failed|Błąd|error|nie udało/i);
  });
});
