import { createHash, randomBytes } from "node:crypto";
import type {
  NarrationTurn,
  ResolvedTurn,
  SessionState,
} from "@/lib/schemas/session";
import { MAX_CHARACTERS_PER_SESSION } from "@/lib/schemas/session";
import type { PathfinderVersion } from "@/lib/schemas/version";
import type { CharacterSheetParsed } from "@/lib/schemas/character-sheet";

/**
 * Server-only session store.
 *
 * Holds the per-session append-only turn log that backs the Stateful
 * Interaction Loop. The interface is async so Redis (or any future
 * remote store) can implement it without refactoring callers.
 *
 * Per CLAUDE.md's state boundary invariant, nothing in this file is
 * safe to import from a client component. Only API route handlers and
 * orchestrators should touch the store.
 */

export const MAX_TURNS_PER_SESSION = 200;
export const MAX_SESSIONS_TRACKED = 1000;
export { MAX_CHARACTERS_PER_SESSION };

export interface SessionStore {
  create(version: PathfinderVersion): Promise<SessionState>;
  get(id: string): Promise<SessionState | undefined>;
  appendResolved(
    id: string,
    turn: Omit<ResolvedTurn, "kind" | "at"> & { at?: string }
  ): Promise<SessionState | undefined>;
  appendNarration(
    id: string,
    markdown: string,
    opts?: { at?: string }
  ): Promise<SessionState | undefined>;
  worldStateHash(id: string): Promise<string | undefined>;
  addCharacter(
    id: string,
    character: CharacterSheetParsed
  ): Promise<SessionState | undefined>;
  size(): Promise<number>;
  /** Test-only: clear all sessions. */
  _reset(): Promise<void>;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newSessionId(): string {
  // 18 random bytes base64url-encoded → 24-char URL-safe ID (matches the
  // SessionIdSchema regex and length bounds).
  return randomBytes(18)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function hashState(state: SessionState): string {
  // Deterministic fingerprint of the turn log — the "world-state hash"
  // from the original brief. The narrator treats this as authoritative.
  // sha256 truncated to 16 hex chars is plenty for keying.
  const canonical = JSON.stringify({
    id: state.id,
    version: state.version,
    turns: state.turns,
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

export function buildResolvedTurn(
  input: Omit<ResolvedTurn, "kind" | "at"> & { at?: string }
): ResolvedTurn {
  return {
    kind: "resolved",
    at: input.at ?? nowIso(),
    intent: input.intent,
    result: input.result,
  };
}

export function buildNarrationTurn(
  markdown: string,
  worldStateHash: string,
  opts: { at?: string } = {}
): NarrationTurn {
  return {
    kind: "narration",
    at: opts.at ?? nowIso(),
    markdown,
    worldStateHash,
  };
}

export function appendTurnCapped<T extends { turns: SessionState["turns"] }>(
  state: T,
  turn: SessionState["turns"][number]
): SessionState["turns"] {
  return [...state.turns, turn].slice(-MAX_TURNS_PER_SESSION);
}

/**
 * In-memory session store. Holds sessions in a Map<id, SessionState> in
 * module scope on the server and persists across requests on a warm
 * Scaleway Serverless Container instance. Cold starts and horizontal
 * scaling WILL lose state — this is the local-dev and fallback path.
 * Production uses the Redis-backed store via getSessionStore().
 */
export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionState>();

  async create(version: PathfinderVersion): Promise<SessionState> {
    if (this.sessions.size >= MAX_SESSIONS_TRACKED) {
      const oldestKey = this.sessions.keys().next().value;
      if (oldestKey) this.sessions.delete(oldestKey);
    }
    const id = newSessionId();
    const now = nowIso();
    const state: SessionState = {
      id,
      version,
      createdAt: now,
      updatedAt: now,
      turns: [],
      characters: [],
    };
    this.sessions.set(id, state);
    return state;
  }

  async get(id: string): Promise<SessionState | undefined> {
    return this.sessions.get(id);
  }

  async appendResolved(
    id: string,
    turn: Omit<ResolvedTurn, "kind" | "at"> & { at?: string }
  ): Promise<SessionState | undefined> {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    const resolved = buildResolvedTurn(turn);
    const next: SessionState = {
      ...session,
      updatedAt: nowIso(),
      turns: appendTurnCapped(session, resolved),
    };
    this.sessions.set(id, next);
    return next;
  }

  async appendNarration(
    id: string,
    markdown: string,
    opts: { at?: string } = {}
  ): Promise<SessionState | undefined> {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    const narration = buildNarrationTurn(
      markdown,
      hashState(session),
      opts
    );
    const next: SessionState = {
      ...session,
      updatedAt: nowIso(),
      turns: appendTurnCapped(session, narration),
    };
    this.sessions.set(id, next);
    return next;
  }

  async worldStateHash(id: string): Promise<string | undefined> {
    const session = this.sessions.get(id);
    return session ? hashState(session) : undefined;
  }

  async addCharacter(
    id: string,
    character: CharacterSheetParsed
  ): Promise<SessionState | undefined> {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (session.characters.length >= MAX_CHARACTERS_PER_SESSION) {
      throw new Error(
        `Character roster is full (max ${MAX_CHARACTERS_PER_SESSION}).`
      );
    }
    const duplicate = session.characters.find(
      (c) => c.name.toLowerCase() === character.name.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`A character named "${character.name}" already exists in this session.`);
    }
    const next: SessionState = {
      ...session,
      updatedAt: nowIso(),
      characters: [...session.characters, character],
    };
    this.sessions.set(id, next);
    return next;
  }

  async size(): Promise<number> {
    return this.sessions.size;
  }

  async _reset(): Promise<void> {
    this.sessions.clear();
  }
}
