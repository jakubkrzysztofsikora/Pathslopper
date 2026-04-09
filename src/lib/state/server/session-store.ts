import { createHash, randomBytes } from "node:crypto";
import type {
  NarrationTurn,
  ResolvedTurn,
  SessionState,
} from "@/lib/schemas/session";
import type { PathfinderVersion } from "@/lib/schemas/version";

/**
 * Server-only in-memory session store.
 *
 * Holds the per-session append-only turn log that backs the Stateful
 * Interaction Loop. Lives in module scope on the server and persists
 * across requests on a warm Scaleway Serverless Container instance.
 * Cold starts and horizontal scaling WILL lose state — this is the
 * acknowledged MVP limit. RedisVL will replace this module under the
 * same interface in a later tranche.
 *
 * Per CLAUDE.md's state boundary invariant, nothing in this file is
 * safe to import from a client component. Only API route handlers and
 * orchestrators should touch the store.
 */

const MAX_TURNS_PER_SESSION = 200;
const MAX_SESSIONS_TRACKED = 1000;

export interface SessionStore {
  create(version: PathfinderVersion): SessionState;
  get(id: string): SessionState | undefined;
  appendResolved(
    id: string,
    turn: Omit<ResolvedTurn, "kind" | "at"> & { at?: string }
  ): SessionState | undefined;
  appendNarration(
    id: string,
    markdown: string,
    opts?: { at?: string }
  ): SessionState | undefined;
  worldStateHash(id: string): string | undefined;
  size(): number;
  /** Test-only: clear all sessions. */
  _reset(): void;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newSessionId(): string {
  // 18 random bytes base64url-encoded → 24-char URL-safe ID (matches the
  // SessionIdSchema regex and length bounds).
  return randomBytes(18)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function hashState(state: SessionState): string {
  // Deterministic fingerprint of the turn log. The "world-state hash" in
  // the original brief — the AI narrates against this so determinism is
  // explicit. sha256 truncated to 16 hex chars is plenty for keying.
  const canonical = JSON.stringify({
    id: state.id,
    version: state.version,
    turns: state.turns,
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionState>();

  create(version: PathfinderVersion): SessionState {
    // Trim oldest sessions if we hit the cap so the map cannot grow
    // unboundedly in a long-running container.
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
    };
    this.sessions.set(id, state);
    return state;
  }

  get(id: string): SessionState | undefined {
    return this.sessions.get(id);
  }

  appendResolved(
    id: string,
    turn: Omit<ResolvedTurn, "kind" | "at"> & { at?: string }
  ): SessionState | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    const resolved: ResolvedTurn = {
      kind: "resolved",
      at: turn.at ?? nowIso(),
      intent: turn.intent,
      result: turn.result,
    };
    const nextTurns = [...session.turns, resolved].slice(-MAX_TURNS_PER_SESSION);
    const next: SessionState = {
      ...session,
      updatedAt: nowIso(),
      turns: nextTurns,
    };
    this.sessions.set(id, next);
    return next;
  }

  appendNarration(
    id: string,
    markdown: string,
    opts: { at?: string } = {}
  ): SessionState | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    const narration: NarrationTurn = {
      kind: "narration",
      at: opts.at ?? nowIso(),
      markdown,
      worldStateHash: hashState(session),
    };
    const nextTurns = [...session.turns, narration].slice(
      -MAX_TURNS_PER_SESSION
    );
    const next: SessionState = {
      ...session,
      updatedAt: nowIso(),
      turns: nextTurns,
    };
    this.sessions.set(id, next);
    return next;
  }

  worldStateHash(id: string): string | undefined {
    const session = this.sessions.get(id);
    return session ? hashState(session) : undefined;
  }

  size(): number {
    return this.sessions.size;
  }

  _reset(): void {
    this.sessions.clear();
  }
}

// Singleton. Warm Serverless Container instances reuse this across
// requests; cold starts reset it. Acceptable for the MVP slice — the
// RedisVL replacement will expose the same interface.
let _store: SessionStore | null = null;

export function getSessionStore(): SessionStore {
  if (!_store) _store = new InMemorySessionStore();
  return _store;
}

export { hashState, MAX_TURNS_PER_SESSION, MAX_SESSIONS_TRACKED };
