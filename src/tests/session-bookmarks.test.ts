import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  useSessionBookmarks,
  BOOKMARKS_STORAGE_KEY,
} from "@/lib/state/client/session-bookmarks";
import type { StoryDNA } from "@/lib/schemas/story-dna";

/**
 * Unit tests for the client-side session bookmarks store.
 *
 * The store is the backbone of the "manage previous sessions" UX: it keeps
 * a localStorage-backed index of session IDs + cosmetic metadata so the
 * hub can render a list across refreshes. These tests pin the contract —
 * add/rename/remove/touch must all persist through JSON — and exercise
 * the expired-session probe path used by `SessionList.validateAll()`.
 */

const baseDna: StoryDNA = {
  version: "pf2e",
  sliders: { narrativePacing: 50, tacticalLethality: 50, npcImprov: 50 },
  tags: { include: [], exclude: [] },
};

function makeBookmark(id: string, overrides: Partial<{ name: string; version: "pf1e" | "pf2e" }> = {}) {
  return {
    id,
    name: overrides.name ?? `Sesja ${id}`,
    version: overrides.version ?? ("pf2e" as const),
    createdAt: "2026-04-11T12:00:00.000Z",
    storyDnaSnapshot: baseDna,
  };
}

describe("sessionBookmarks store", () => {
  beforeEach(() => {
    useSessionBookmarks.getState()._reset();
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("add prepends a new bookmark and persists to localStorage", () => {
    useSessionBookmarks.getState().add(makeBookmark("sess_111"));
    const state = useSessionBookmarks.getState();
    expect(state.bookmarks).toHaveLength(1);
    expect(state.bookmarks[0].id).toBe("sess_111");
    const raw = window.localStorage.getItem(BOOKMARKS_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed[0].id).toBe("sess_111");
  });

  it("re-adding the same id replaces the older entry (de-dupe)", () => {
    const api = useSessionBookmarks.getState();
    api.add(makeBookmark("sess_same", { name: "Stara nazwa" }));
    api.add(makeBookmark("sess_same", { name: "Nowa nazwa" }));
    const state = useSessionBookmarks.getState();
    expect(state.bookmarks).toHaveLength(1);
    expect(state.bookmarks[0].name).toBe("Nowa nazwa");
  });

  it("rename updates the name in place", () => {
    const api = useSessionBookmarks.getState();
    api.add(makeBookmark("sess_a"));
    api.rename("sess_a", "Klasyczna wyprawa · 11 kwi");
    expect(useSessionBookmarks.getState().bookmarks[0].name).toBe(
      "Klasyczna wyprawa · 11 kwi"
    );
  });

  it("remove deletes the bookmark by id", () => {
    const api = useSessionBookmarks.getState();
    api.add(makeBookmark("sess_a"));
    api.add(makeBookmark("sess_b"));
    api.remove("sess_a");
    const state = useSessionBookmarks.getState();
    expect(state.bookmarks).toHaveLength(1);
    expect(state.bookmarks[0].id).toBe("sess_b");
  });

  it("touch updates lastOpenedAt and clears the expired flag", () => {
    const api = useSessionBookmarks.getState();
    api.add(makeBookmark("sess_a"));
    api.markExpired("sess_a", true);
    expect(useSessionBookmarks.getState().bookmarks[0].expired).toBe(true);
    api.touch("sess_a");
    const bm = useSessionBookmarks.getState().bookmarks[0];
    expect(bm.expired).toBe(false);
    expect(typeof bm.lastOpenedAt).toBe("string");
  });

  it("_hydrate reads bookmarks back from localStorage on first call", () => {
    const seed = [
      {
        ...makeBookmark("sess_hydrated"),
        lastOpenedAt: "2026-04-11T11:00:00.000Z",
      },
    ];
    window.localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(seed));
    useSessionBookmarks.setState({ bookmarks: [], hydrated: false });
    useSessionBookmarks.getState()._hydrate();
    expect(useSessionBookmarks.getState().bookmarks).toHaveLength(1);
    expect(useSessionBookmarks.getState().bookmarks[0].id).toBe("sess_hydrated");
  });

  it("_hydrate ignores corrupt JSON and starts empty", () => {
    window.localStorage.setItem(BOOKMARKS_STORAGE_KEY, "{not json");
    useSessionBookmarks.setState({ bookmarks: [], hydrated: false });
    useSessionBookmarks.getState()._hydrate();
    expect(useSessionBookmarks.getState().bookmarks).toEqual([]);
  });

  it("validateAll flips bookmarks whose server session is 404 to expired", async () => {
    const api = useSessionBookmarks.getState();
    api.add(makeBookmark("sess_live"));
    api.add(makeBookmark("sess_gone"));
    const mockFetch = vi.fn(async (url: string) => {
      if (url === "/api/sessions/sess_live") {
        return { status: 200 } as Response;
      }
      if (url === "/api/sessions/sess_gone") {
        return { status: 404 } as Response;
      }
      throw new Error(`unexpected url: ${url}`);
    });

    await useSessionBookmarks
      .getState()
      .validateAll(mockFetch as unknown as typeof fetch);

    const byId = Object.fromEntries(
      useSessionBookmarks.getState().bookmarks.map((b) => [b.id, b])
    );
    expect(byId["sess_live"].expired).toBe(false);
    expect(byId["sess_gone"].expired).toBe(true);
  });

  it("validateAll does not mark anything expired on network failure", async () => {
    const api = useSessionBookmarks.getState();
    api.add(makeBookmark("sess_flaky"));
    const mockFetch = vi.fn(async () => {
      throw new Error("network down");
    });

    await useSessionBookmarks
      .getState()
      .validateAll(mockFetch as unknown as typeof fetch);

    expect(useSessionBookmarks.getState().bookmarks[0].expired).toBeUndefined();
  });
});
