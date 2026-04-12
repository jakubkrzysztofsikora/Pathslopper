import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { EndingScreen } from "@/components/play/ending-screen";
import type { Ending } from "@/lib/schemas/session-graph";

afterEach(cleanup);

function makeEnding(overrides: Partial<Ending> = {}): Ending {
  return {
    id: "end-victory",
    nodeId: "node-victory",
    condition: { op: "flag-set", flag: "tyrant-defeated" },
    title: "Wolność",
    summary: "Tyran został pokonany, region jest wolny.",
    category: "victory",
    frontOutcomes: { "front-1": "neutralized" },
    ...overrides,
  };
}

describe("EndingScreen", () => {
  it("renders ending title", () => {
    render(
      <EndingScreen
        sessionId="sess-1"
        ending={makeEnding({ title: "Wielkie zwycięstwo" })}
        sessionTitle="Sesja testowa"
        onNewSession={vi.fn()}
      />
    );
    expect(screen.getByText("Wielkie zwycięstwo")).toBeDefined();
  });

  it("renders ending summary when present", () => {
    render(
      <EndingScreen
        sessionId="sess-1"
        ending={makeEnding({ summary: "Bohaterzy triumfowali nad złem." })}
        sessionTitle="Test"
        onNewSession={vi.fn()}
      />
    );
    expect(screen.getByText("Bohaterzy triumfowali nad złem.")).toBeDefined();
  });

  it("shows the ending category badge", () => {
    render(
      <EndingScreen
        sessionId="sess-1"
        ending={makeEnding({ category: "defeat" })}
        sessionTitle="Test"
        onNewSession={vi.fn()}
      />
    );
    expect(screen.getByText("DEFEAT")).toBeDefined();
  });

  it("falls back to sessionTitle when ending is null", () => {
    render(
      <EndingScreen
        sessionId="sess-1"
        ending={null}
        sessionTitle="Tytan tyrana"
        onNewSession={vi.fn()}
      />
    );
    expect(screen.getByText("Tytan tyrana")).toBeDefined();
  });

  it("clicking bookmark button persists to localStorage", () => {
    localStorage.clear();
    render(
      <EndingScreen
        sessionId="sess-bookmark-1"
        ending={makeEnding()}
        sessionTitle="Sesja do zakładki"
        onNewSession={vi.fn()}
      />
    );
    // t("play.endingBookmark") = "Zapisz zakładkę"
    const bookmarkBtn = screen.getByRole("button", {
      name: /Zapisz zakładkę/i,
    });
    fireEvent.click(bookmarkBtn);
    const stored = localStorage.getItem("pfnexus:bookmarks");
    expect(stored).toBeDefined();
    expect(stored).toContain("sess-bookmark-1");
  });

  it("does not add duplicate bookmark on second click", () => {
    localStorage.clear();
    render(
      <EndingScreen
        sessionId="sess-dedup"
        ending={makeEnding()}
        sessionTitle="Test"
        onNewSession={vi.fn()}
      />
    );
    // t("play.endingBookmark") = "Zapisz zakładkę"
    const btn = screen.getByRole("button", { name: /Zapisz zakładkę/i });
    fireEvent.click(btn);
    fireEvent.click(btn);

    const stored = JSON.parse(localStorage.getItem("pfnexus:bookmarks") ?? "[]");
    const matches = stored.filter((b: { id: string }) => b.id === "sess-dedup");
    expect(matches).toHaveLength(1);
  });

  it("calls onNewSession when new session button is clicked", () => {
    const onNewSession = vi.fn();
    render(
      <EndingScreen
        sessionId="sess-1"
        ending={makeEnding()}
        sessionTitle="Test"
        onNewSession={onNewSession}
      />
    );
    // t("play.endingNewSession") = "Nowa sesja"
    const btn = screen.getByRole("button", { name: /Nowa sesja/i });
    fireEvent.click(btn);
    expect(onNewSession).toHaveBeenCalledOnce();
  });

  it("renders endingTitle label", () => {
    render(
      <EndingScreen
        sessionId="sess-1"
        ending={makeEnding()}
        sessionTitle="Test"
        onNewSession={vi.fn()}
      />
    );
    // t("play.endingTitle") = "Koniec sesji"
    expect(screen.getByText(/Koniec sesji/i)).toBeDefined();
  });
});
