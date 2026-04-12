import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CharacterSwitcher } from "@/components/play/character-switcher";
import type { CharacterSheetParsed } from "@/lib/schemas/character-sheet";
import type { WorldState } from "@/lib/schemas/session";

afterEach(cleanup);

function makeWorldState(overrides: Partial<WorldState> = {}): WorldState {
  return {
    clocks: {},
    flags: [],
    vars: {},
    spotlightDebt: {},
    turnCount: 0,
    lastDirectorMove: "none",
    stallTicks: 0,
    elapsedMinutes: 0,
    ephemeralNpcs: [],
    ...overrides,
  };
}

function makeCharacter(name: string): CharacterSheetParsed {
  return {
    version: "pf2e",
    name,
    ancestry: "Human",
    background: "Soldier",
    class: "Fighter",
    level: 3,
    actionTags: [],
    proficiencies: {},
    abilityScores: { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 8 },
  };
}

describe("CharacterSwitcher", () => {
  it("renders a button for each character", () => {
    const characters = [makeCharacter("Aldric"), makeCharacter("Zara")];
    render(
      <CharacterSwitcher
        characters={characters}
        activeCharacter={null}
        worldState={makeWorldState()}
        onSwitch={vi.fn()}
      />
    );
    expect(screen.getByText("Aldric")).toBeDefined();
    expect(screen.getByText("Zara")).toBeDefined();
  });

  it("highlights the active character with distinct styling", () => {
    const characters = [makeCharacter("Aldric"), makeCharacter("Zara")];
    const { container } = render(
      <CharacterSwitcher
        characters={characters}
        activeCharacter="Aldric"
        worldState={makeWorldState()}
        onSwitch={vi.fn()}
      />
    );
    // Active character button has ring-amber-600 class
    const activeBtn = container.querySelector(".ring-amber-600");
    expect(activeBtn).toBeDefined();
    expect(activeBtn?.textContent).toContain("Aldric");
  });

  it("calls onSwitch with character name when button clicked", () => {
    const onSwitch = vi.fn();
    const characters = [makeCharacter("Aldric"), makeCharacter("Zara")];
    render(
      <CharacterSwitcher
        characters={characters}
        activeCharacter={null}
        worldState={makeWorldState()}
        onSwitch={onSwitch}
      />
    );
    fireEvent.click(screen.getByText("Zara"));
    expect(onSwitch).toHaveBeenCalledWith("Zara");
  });

  it("shows spotlight debt badge when debt > 0", () => {
    const characters = [makeCharacter("Aldric")];
    const worldState = makeWorldState({ spotlightDebt: { Aldric: 5 } });
    render(
      <CharacterSwitcher
        characters={characters}
        activeCharacter={null}
        worldState={worldState}
        onSwitch={vi.fn()}
      />
    );
    expect(screen.getByText("5")).toBeDefined();
  });

  it("does NOT show spotlight debt badge when debt is 0", () => {
    const characters = [makeCharacter("Aldric")];
    const worldState = makeWorldState({ spotlightDebt: { Aldric: 0 } });
    const { container } = render(
      <CharacterSwitcher
        characters={characters}
        activeCharacter={null}
        worldState={worldState}
        onSwitch={vi.fn()}
      />
    );
    // Debt badge (blue-300 text) should not be present
    const badge = container.querySelector(".text-blue-300");
    expect(badge).toBeNull();
  });

  it("renders heading for the character list", () => {
    render(
      <CharacterSwitcher
        characters={[makeCharacter("X")]}
        activeCharacter={null}
        worldState={makeWorldState()}
        onSwitch={vi.fn()}
      />
    );
    // t("play.characterSwitcherHeading") = "Postacie"
    expect(screen.getByText("Postacie")).toBeDefined();
  });
});
