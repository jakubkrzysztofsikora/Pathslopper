import type { SessionState, WorldState } from "@/lib/schemas/session";
import { MAX_CHARACTERS_PER_SESSION } from "@/lib/schemas/session";
import type { SessionBrief } from "@/lib/schemas/session-brief";
import type { SessionGraph } from "@/lib/schemas/session-graph";
import type { PathfinderVersion } from "@/lib/schemas/version";
import type { CharacterSheetParsed } from "@/lib/schemas/character-sheet";
import {
  MAX_SESSIONS_TRACKED,
  newSessionId,
  nowIso,
  type SessionStore,
} from "./session-store";

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
      phase: "brief",
      worldState: {
        clocks: {},
        flags: [],
        vars: {},
        spotlightDebt: {},
        turnCount: 0,
        lastDirectorMove: "none",
        stallTicks: 0,
        elapsedMinutes: 0,
        ephemeralNpcs: [],
      },
      characters: [],
    };
    this.sessions.set(id, state);
    return state;
  }

  async get(id: string): Promise<SessionState | undefined> {
    return this.sessions.get(id);
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
      throw new Error(
        `A character named "${character.name}" already exists in this session.`
      );
    }
    const next: SessionState = {
      ...session,
      updatedAt: nowIso(),
      characters: [...session.characters, character],
    };
    this.sessions.set(id, next);
    return next;
  }

  async setBrief(
    id: string,
    brief: SessionBrief
  ): Promise<SessionState | undefined> {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    const next: SessionState = {
      ...session,
      updatedAt: nowIso(),
      brief,
    };
    this.sessions.set(id, next);
    return next;
  }

  async setGraph(
    id: string,
    graph: SessionGraph
  ): Promise<SessionState | undefined> {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    const next: SessionState = {
      ...session,
      updatedAt: nowIso(),
      phase: "authoring",
      graph,
    };
    this.sessions.set(id, next);
    return next;
  }

  async updateGraph(
    id: string,
    patch: Partial<SessionGraph>
  ): Promise<SessionState | undefined> {
    const session = this.sessions.get(id);
    if (!session || !session.graph) return undefined;
    const next: SessionState = {
      ...session,
      updatedAt: nowIso(),
      graph: { ...session.graph, ...patch },
    };
    this.sessions.set(id, next);
    return next;
  }

  async approve(
    id: string,
    inkCompiled: string
  ): Promise<SessionState | undefined> {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    const next: SessionState = {
      ...session,
      updatedAt: nowIso(),
      phase: "approved",
      inkCompiled,
    };
    this.sessions.set(id, next);
    return next;
  }

  async tick(
    id: string,
    inkState: string,
    worldState: WorldState
  ): Promise<SessionState | undefined> {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    const next: SessionState = {
      ...session,
      updatedAt: nowIso(),
      phase: "playing",
      inkState,
      worldState,
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
