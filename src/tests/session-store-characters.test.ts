import { describe, it, expect, beforeEach } from "vitest";
import { InMemorySessionStore } from "@/lib/state/server/session-store";
import { SessionStateSchema } from "@/lib/schemas/session";
import type { CharacterSheetParsed } from "@/lib/schemas/character-sheet";

function makePF2eCharacter(name = "Aldric"): CharacterSheetParsed {
  return {
    version: "pf2e",
    name,
    ancestry: "Human",
    background: "Scholar",
    class: "Wizard",
    level: 5,
    actionTags: ["Arcane Cascade"],
    proficiencies: {
      Arcana: "expert",
      Athletics: "trained",
    },
    abilityScores: {
      str: 10,
      dex: 14,
      con: 12,
      int: 18,
      wis: 14,
      cha: 10,
    },
  };
}

describe("InMemorySessionStore — addCharacter", () => {
  const store = new InMemorySessionStore();

  beforeEach(async () => {
    await store._reset();
  });

  it("adds a character to a session", async () => {
    const session = await store.create("pf2e");
    const character = makePF2eCharacter("Aldric");
    const updated = await store.addCharacter(session.id, character);
    expect(updated).toBeDefined();
    expect(updated?.characters).toHaveLength(1);
    expect(updated?.characters[0].name).toBe("Aldric");
  });

  it("returns undefined for an unknown session", async () => {
    const character = makePF2eCharacter("Aldric");
    const result = await store.addCharacter("nonexistent-session-id", character);
    expect(result).toBeUndefined();
  });

  it("caps roster at 12 characters and throws when at capacity", async () => {
    const session = await store.create("pf2e");
    for (let i = 0; i < 12; i++) {
      await store.addCharacter(session.id, makePF2eCharacter(`Character${i}`));
    }
    await expect(
      store.addCharacter(session.id, makePF2eCharacter("Overflow"))
    ).rejects.toThrow();
  });

  it("rejects a duplicate character name (case-insensitive)", async () => {
    const session = await store.create("pf2e");
    await store.addCharacter(session.id, makePF2eCharacter("Aldric"));
    await expect(
      store.addCharacter(session.id, makePF2eCharacter("aldric"))
    ).rejects.toThrow();
  });

  it("bumps updatedAt after addCharacter", async () => {
    const session = await store.create("pf2e");
    await new Promise((r) => setTimeout(r, 2));
    const updated = await store.addCharacter(session.id, makePF2eCharacter());
    expect(updated?.updatedAt).not.toBe(session.updatedAt);
  });
});

describe("SessionStateSchema — backwards compatibility", () => {
  it("parses a legacy session blob without the characters field", () => {
    const legacyBlob = {
      id: "abcdefgh12345678",
      version: "pf2e",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      turns: [],
      // no 'characters' field
    };
    const result = SessionStateSchema.safeParse(legacyBlob);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.characters).toEqual([]);
    }
  });

  it("parses a session blob with characters field populated", () => {
    const blob = {
      id: "abcdefgh12345678",
      version: "pf2e",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      turns: [],
      characters: [makePF2eCharacter("Aldric")],
    };
    const result = SessionStateSchema.safeParse(blob);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.characters).toHaveLength(1);
    }
  });
});
