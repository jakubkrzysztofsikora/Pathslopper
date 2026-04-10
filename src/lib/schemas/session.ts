import { z } from "zod";
import { VersionSchema } from "./version";
import { PlayerIntentSchema } from "./player-intent";
import { AdjudicationResultSchema } from "./adjudication";
import { CharacterSheetParsedSchema } from "./character-sheet";

/**
 * Session + Turn schemas for the Stateful Interaction Loop.
 *
 * A Session is a server-owned append-only log of turns. Turns are either
 * a `resolved` action (PlayerIntent + AdjudicationResult — produced by
 * Phase 2 + Phase 3) or a `narration` emitted by Phase 1 based on the
 * current session state.
 *
 * Per the CLAUDE.md state boundary invariant, sessions live on the
 * server — never in zustand, never on the client. The client holds only
 * an opaque `sessionId` reference. RedisVL will eventually replace the
 * in-memory store at src/lib/state/server/session-store.ts without a
 * schema change, because this type is already the persistence contract.
 */

const SessionIdSchema = z
  .string()
  .trim()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Session ID must be URL-safe.");

export const ResolvedTurnSchema = z.object({
  kind: z.literal("resolved"),
  at: z.string().datetime(),
  intent: PlayerIntentSchema,
  result: AdjudicationResultSchema,
});

export const NarrationTurnSchema = z.object({
  kind: z.literal("narration"),
  at: z.string().datetime(),
  markdown: z.string().min(1).max(10_000),
  worldStateHash: z.string().min(8).max(64),
});

export const ManagerOverrideTurnSchema = z.object({
  kind: z.literal("manager-override"),
  at: z.string().datetime(),
  summary: z.string().min(1).max(2000),
  forcedOutcome: z.string().min(1).max(2000),
  turnsConsidered: z.number().int().min(1).max(50),
});

export const TurnSchema = z.discriminatedUnion("kind", [
  ResolvedTurnSchema,
  NarrationTurnSchema,
  ManagerOverrideTurnSchema,
]);

export const MAX_CHARACTERS_PER_SESSION = 12;

export const SessionStateSchema = z.object({
  id: SessionIdSchema,
  version: VersionSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  turns: z.array(TurnSchema).max(500),
  characters: z.array(CharacterSheetParsedSchema).max(MAX_CHARACTERS_PER_SESSION).default([]),
  activeOverride: z.object({
    forcedOutcome: z.string().min(1).max(2000),
    setAt: z.string().datetime(),
  }).nullable().default(null),
});

export type SessionId = z.infer<typeof SessionIdSchema>;
export type ResolvedTurn = z.infer<typeof ResolvedTurnSchema>;
export type NarrationTurn = z.infer<typeof NarrationTurnSchema>;
export type ManagerOverrideTurn = z.infer<typeof ManagerOverrideTurnSchema>;
export type Turn = z.infer<typeof TurnSchema>;
export type SessionState = z.infer<typeof SessionStateSchema>;

export { SessionIdSchema };
