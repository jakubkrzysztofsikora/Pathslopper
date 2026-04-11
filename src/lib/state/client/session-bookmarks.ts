"use client";

/**
 * Client-side "session bookmarks" store.
 *
 * CLAUDE.md boundary: the server owns session content (turns, world-state,
 * character roster). The client is only allowed to remember *which*
 * sessions it created and how they were named — never to mirror the turn
 * log itself. This store is exactly that: an index of session IDs with
 * cosmetic metadata (local name, version badge, Story DNA snapshot that
 * was used at creation).
 *
 * Persistence: localStorage under `pfnexus:bookmarks`. We use a bespoke
 * persist wrapper instead of `zustand/middleware/persist` because the
 * repo's current zustand version does not ship middleware types in a way
 * that plays nicely with our stricter tsconfig. A hand-rolled hydrate
 * on first use keeps the dependency surface smaller and lets us control
 * the validation path ourselves.
 *
 * Expiry: the server runs a 24h sliding TTL on each session. We do NOT
 * proactively prune bookmarks locally; instead, `validateAll()` pings
 * `GET /api/sessions/[id]` for each entry and marks 404s as expired so
 * the UI can offer "forget" without silently disappearing entries.
 */

import * as React from "react";
import { create } from "zustand";
import type { PathfinderVersion } from "@/lib/schemas/version";
import type { StoryDNA } from "@/lib/schemas/story-dna";

export const BOOKMARKS_STORAGE_KEY = "pfnexus:bookmarks";

export interface SessionBookmark {
  id: string;
  name: string;
  version: PathfinderVersion;
  createdAt: string;
  lastOpenedAt: string;
  /** Snapshot of the Story DNA at the moment the session was created. Purely cosmetic — the server already baked these values into the session. */
  storyDnaSnapshot: StoryDNA;
  /** Set by `validateAll()` when `GET /api/sessions/[id]` returns 404. */
  expired?: boolean;
}

interface BookmarksState {
  bookmarks: SessionBookmark[];
  hydrated: boolean;
  add: (bookmark: Omit<SessionBookmark, "lastOpenedAt"> & { lastOpenedAt?: string }) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  touch: (id: string) => void;
  markExpired: (id: string, expired: boolean) => void;
  validateAll: (fetcher?: typeof fetch) => Promise<void>;
  _hydrate: () => void;
  _reset: () => void;
}

function safeParse(raw: string | null): SessionBookmark[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b): b is SessionBookmark =>
        typeof b === "object" &&
        b !== null &&
        typeof (b as SessionBookmark).id === "string" &&
        typeof (b as SessionBookmark).name === "string" &&
        typeof (b as SessionBookmark).createdAt === "string"
    );
  } catch {
    return [];
  }
}

function writeToStorage(bookmarks: SessionBookmark[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      BOOKMARKS_STORAGE_KEY,
      JSON.stringify(bookmarks)
    );
  } catch {
    // Storage full or disabled — silent ignore. The store still works
    // in-memory for the current session.
  }
}

export const useSessionBookmarks = create<BookmarksState>((set, get) => ({
  bookmarks: [],
  hydrated: false,

  _hydrate: () => {
    if (get().hydrated) return;
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(BOOKMARKS_STORAGE_KEY);
    set({ bookmarks: safeParse(raw), hydrated: true });
  },

  add: (bookmark) => {
    const now = new Date().toISOString();
    const fresh: SessionBookmark = {
      ...bookmark,
      lastOpenedAt: bookmark.lastOpenedAt ?? now,
    };
    set((state) => {
      // De-dupe on id so re-creating a session with the same id replaces.
      const filtered = state.bookmarks.filter((b) => b.id !== fresh.id);
      const next = [fresh, ...filtered];
      writeToStorage(next);
      return { bookmarks: next };
    });
  },

  rename: (id, name) => {
    set((state) => {
      const next = state.bookmarks.map((b) =>
        b.id === id ? { ...b, name } : b
      );
      writeToStorage(next);
      return { bookmarks: next };
    });
  },

  remove: (id) => {
    set((state) => {
      const next = state.bookmarks.filter((b) => b.id !== id);
      writeToStorage(next);
      return { bookmarks: next };
    });
  },

  touch: (id) => {
    set((state) => {
      const now = new Date().toISOString();
      const next = state.bookmarks.map((b) =>
        b.id === id ? { ...b, lastOpenedAt: now, expired: false } : b
      );
      writeToStorage(next);
      return { bookmarks: next };
    });
  },

  markExpired: (id, expired) => {
    set((state) => {
      const next = state.bookmarks.map((b) =>
        b.id === id ? { ...b, expired } : b
      );
      writeToStorage(next);
      return { bookmarks: next };
    });
  },

  /**
   * Pings the server for every bookmark and flips `expired` based on the
   * response. Uses `Promise.allSettled` so a single failing probe does not
   * poison the whole validation pass — a flaky network should not blank
   * the entire list.
   */
  validateAll: async (fetcher = fetch) => {
    const state = get();
    if (state.bookmarks.length === 0) return;
    const probes = await Promise.allSettled(
      state.bookmarks.map(async (b) => {
        const res = await fetcher(`/api/sessions/${b.id}`, { method: "GET" });
        return { id: b.id, status: res.status };
      })
    );
    set((prev) => {
      const next = prev.bookmarks.map((b) => {
        const probe = probes.find(
          (p) => p.status === "fulfilled" && p.value.id === b.id
        );
        if (!probe || probe.status !== "fulfilled") return b;
        const httpStatus = probe.value.status;
        if (httpStatus === 404) return { ...b, expired: true };
        if (httpStatus >= 200 && httpStatus < 300) return { ...b, expired: false };
        return b;
      });
      writeToStorage(next);
      return { bookmarks: next };
    });
  },

  _reset: () => {
    writeToStorage([]);
    set({ bookmarks: [], hydrated: true });
  },
}));

/**
 * React hook that hydrates the store on mount. Use in client pages that
 * render session lists; safe to call multiple times.
 */
export function useHydratedSessionBookmarks() {
  const hydrate = useSessionBookmarks((s) => s._hydrate);
  const hydrated = useSessionBookmarks((s) => s.hydrated);
  React.useEffect(() => {
    hydrate();
  }, [hydrate]);
  return hydrated;
}
