import { randomBytes } from "node:crypto";
import type { SessionState, WorldState } from "@/lib/schemas/session";
import type { SessionBrief } from "@/lib/schemas/session-brief";
import type { SessionGraph } from "@/lib/schemas/session-graph";
import type { PathfinderVersion } from "@/lib/schemas/version";
import type { CharacterSheetParsed } from "@/lib/schemas/character-sheet";

export const MAX_SESSIONS_TRACKED = 1000;

export interface SessionStore {
  create(version: PathfinderVersion): Promise<SessionState>;
  get(id: string): Promise<SessionState | undefined>;
  addCharacter(
    id: string,
    character: CharacterSheetParsed
  ): Promise<SessionState | undefined>;
  // Phase 1 graph-lifecycle methods (Amendment A)
  setBrief(id: string, brief: SessionBrief): Promise<SessionState | undefined>;
  setGraph(id: string, graph: SessionGraph): Promise<SessionState | undefined>;
  updateGraph(
    id: string,
    patch: Partial<SessionGraph>
  ): Promise<SessionState | undefined>;
  approve(id: string, inkCompiled: string): Promise<SessionState | undefined>;
  tick(
    id: string,
    inkState: string,
    worldState: WorldState
  ): Promise<SessionState | undefined>;
  size(): Promise<number>;
  /** Test-only: clear all sessions. */
  _reset(): Promise<void>;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newSessionId(): string {
  return randomBytes(18)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
