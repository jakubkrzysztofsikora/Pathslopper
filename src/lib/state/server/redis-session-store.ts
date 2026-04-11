import type { PathfinderVersion } from "@/lib/schemas/version";
import {
  SessionStateSchema,
  type ResolvedTurn,
  type SessionState,
} from "@/lib/schemas/session";

import type { CharacterSheetParsed } from "@/lib/schemas/character-sheet";
import {
  appendTurnCapped,
  buildManagerOverrideTurn,
  buildNarrationTurn,
  buildResolvedTurn,
  hashState,
  MAX_CHARACTERS_PER_SESSION,
  newSessionId,
  nowIso,
  type SessionStore,
} from "./session-store";
import {
  createIoRedisClient,
  type RedisClient,
} from "./redis-client";

/**
 * Redis-backed session store.
 *
 * Sessions are stored as JSON strings under `session:${id}` keys with a
 * 24h sliding TTL. Every mutation (create, appendResolved,
 * appendNarration) extends the TTL, so an active game never expires and
 * an abandoned one evaporates cleanly after a day.
 *
 * Known limitation: mutations are read-modify-write against a single
 * key. Concurrent writers on the same sessionId can lose updates. For
 * the current single-player model this is acceptable; multi-writer
 * safety (WATCH/MULTI optimistic locking or RPUSH onto a list key) is a
 * follow-up when multi-client sessions become a real scenario.
 */

const KEY_PREFIX = "pfnexus:session:";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 24h sliding

function keyFor(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

function matchAllKeysPattern(): string {
  return `${KEY_PREFIX}*`;
}

export class RedisSessionStore implements SessionStore {
  constructor(
    private readonly redis: RedisClient,
    private readonly ttlSeconds: number = DEFAULT_TTL_SECONDS
  ) {}

  static fromUrl(url: string, ttlSeconds?: number): RedisSessionStore {
    return new RedisSessionStore(createIoRedisClient(url), ttlSeconds);
  }

  private async readSession(id: string): Promise<SessionState | undefined> {
    const raw = await this.redis.get(keyFor(id));
    if (!raw) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      // Corrupt entry — treat as missing rather than throwing, so a bad
      // write cannot poison the whole route handler. Log so operators
      // notice data corruption vs. a legitimately missing session.
      console.error(
        `[RedisSessionStore] Failed to parse session ${id}: ${err instanceof Error ? err.message : String(err)}`
      );
      return undefined;
    }
    const result = SessionStateSchema.safeParse(parsed);
    if (!result.success) {
      // Schema validation failure usually means the schema evolved but
      // the persisted data did not. Log so the drift is visible in
      // container logs; caller receives undefined (equivalent to
      // "session expired") which is the safest fallback.
      console.error(
        `[RedisSessionStore] Session ${id} failed schema validation: ${result.error.message}`
      );
      return undefined;
    }
    return result.data;
  }

  private async writeSession(state: SessionState): Promise<void> {
    await this.redis.setWithTtl(
      keyFor(state.id),
      JSON.stringify(state),
      this.ttlSeconds
    );
  }

  async create(version: PathfinderVersion): Promise<SessionState> {
    const id = newSessionId();
    const now = nowIso();
    const state: SessionState = {
      id,
      version,
      createdAt: now,
      updatedAt: now,
      turns: [],
      characters: [],
      activeOverride: null,
    };
    await this.writeSession(state);
    return state;
  }

  async get(id: string): Promise<SessionState | undefined> {
    return this.readSession(id);
  }

  async appendResolved(
    id: string,
    turn: Omit<ResolvedTurn, "kind" | "at"> & { at?: string }
  ): Promise<SessionState | undefined> {
    const session = await this.readSession(id);
    if (!session) return undefined;
    const resolved = buildResolvedTurn(turn);
    const next: SessionState = {
      ...session,
      updatedAt: nowIso(),
      turns: appendTurnCapped(session, resolved),
    };
    await this.writeSession(next);
    return next;
  }

  async appendNarration(
    id: string,
    markdown: string,
    opts: { at?: string } = {}
  ): Promise<SessionState | undefined> {
    const session = await this.readSession(id);
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
    await this.writeSession(next);
    return next;
  }

  async worldStateHash(id: string): Promise<string | undefined> {
    const session = await this.readSession(id);
    return session ? hashState(session) : undefined;
  }

  async addCharacter(
    id: string,
    character: CharacterSheetParsed
  ): Promise<SessionState | undefined> {
    const session = await this.readSession(id);
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
    await this.writeSession(next);
    return next;
  }

  async setActiveOverride(
    id: string,
    forcedOutcome: string,
    summary: string,
    turnsConsidered: number
  ): Promise<SessionState | undefined> {
    const session = await this.readSession(id);
    if (!session) return undefined;
    const overrideTurn = buildManagerOverrideTurn({ summary, forcedOutcome, turnsConsidered });
    const next: SessionState = {
      ...session,
      updatedAt: nowIso(),
      turns: appendTurnCapped(session, overrideTurn),
      activeOverride: { forcedOutcome, setAt: nowIso() },
    };
    await this.writeSession(next);
    return next;
  }

  async clearActiveOverride(id: string): Promise<SessionState | undefined> {
    const session = await this.readSession(id);
    if (!session) return undefined;
    const next: SessionState = {
      ...session,
      updatedAt: nowIso(),
      activeOverride: null,
    };
    await this.writeSession(next);
    return next;
  }

  async consumeOverride(
    id: string,
    turn: Omit<ResolvedTurn, "kind" | "at"> & { at?: string }
  ): Promise<SessionState | undefined> {
    // Single read-modify-write so "clear override" and "append resolved
    // turn" either both land or neither does. Not wrapped in a Redis
    // MULTI/EXEC because the existing mutations in this store are all
    // last-writer-wins reads of the single JSON blob key; adding real
    // optimistic locking (WATCH/MULTI) is a separate, global upgrade.
    const session = await this.readSession(id);
    if (!session) return undefined;
    if (!session.activeOverride) return undefined;
    const resolved = buildResolvedTurn(turn);
    const next: SessionState = {
      ...session,
      updatedAt: nowIso(),
      activeOverride: null,
      turns: appendTurnCapped(session, resolved),
    };
    await this.writeSession(next);
    return next;
  }

  async size(): Promise<number> {
    return this.redis.countKeys(matchAllKeysPattern());
  }

  async _reset(): Promise<void> {
    await this.redis.deleteByPattern(matchAllKeysPattern());
  }
}
