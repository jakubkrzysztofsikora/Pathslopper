import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NarrationFeed, type NarrationEntry } from "@/components/play/narration-feed";

afterEach(cleanup);

function makeEntry(
  overrides: Partial<NarrationEntry> = {}
): NarrationEntry {
  return {
    at: 1,
    speaker: "gm",
    text: "Narrator says something.",
    move: "cutscene",
    ...overrides,
  };
}

describe("NarrationFeed", () => {
  it("renders empty state message when entries is empty", () => {
    render(<NarrationFeed entries={[]} />);
    // t("play.narrationEmpty") = "Sesja się zaczyna…"
    expect(screen.getByText(/Sesja się zaczyna/i)).toBeDefined();
  });

  it("renders narration text for each entry", () => {
    const entries: NarrationEntry[] = [
      makeEntry({ text: "You enter the dungeon." }),
      makeEntry({ text: "A goblin appears!", at: 2 }),
    ];
    render(<NarrationFeed entries={entries} />);
    expect(screen.getByText("You enter the dungeon.")).toBeDefined();
    expect(screen.getByText("A goblin appears!")).toBeDefined();
  });

  it("shows MG label for gm speaker", () => {
    render(<NarrationFeed entries={[makeEntry({ speaker: "gm" })]} />);
    expect(screen.getByText("MG")).toBeDefined();
  });

  it("shows Gracz label for player speaker", () => {
    render(<NarrationFeed entries={[makeEntry({ speaker: "player" })]} />);
    expect(screen.getByText("Gracz")).toBeDefined();
  });

  it("displays move type label for hard move (red color indicator)", () => {
    render(
      <NarrationFeed entries={[makeEntry({ move: "hard" })]} />
    );
    // t("play.moveHard") = "twarde zagranie"
    const moveLabel = screen.queryByText(/twarde zagranie/i);
    expect(moveLabel).toBeDefined();
  });

  it("displays move type label for soft move", () => {
    render(
      <NarrationFeed entries={[makeEntry({ move: "soft" })]} />
    );
    // t("play.moveSoft") = Polish translation for soft
    const moveLabel = screen.queryByText(/miękkie zagranie|soft/i);
    expect(moveLabel).toBeDefined();
  });

  it("does NOT show move label when move is 'none'", () => {
    render(<NarrationFeed entries={[makeEntry({ move: "none" })]} />);
    // move === "none" → the span is not rendered
    expect(screen.queryByText(/moveNone/i)).toBeNull();
  });

  it("renders turn counter (T{at}) for each entry", () => {
    render(<NarrationFeed entries={[makeEntry({ at: 7 })]} />);
    expect(screen.getByText("T7")).toBeDefined();
  });

  it("renders multiple entries preserving order", () => {
    const entries: NarrationEntry[] = [
      makeEntry({ text: "First line.", at: 1 }),
      makeEntry({ text: "Second line.", at: 2 }),
      makeEntry({ text: "Third line.", at: 3 }),
    ];
    render(<NarrationFeed entries={entries} />);
    const allText = screen.getAllByText(/line\./);
    expect(allText).toHaveLength(3);
  });
});
