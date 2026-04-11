import { z } from "zod";
import { VersionSchema } from "./version";
import { CharacterSheetParsedSchema } from "./character-sheet";
import { SessionBriefSchema } from "./session-brief";
import { SessionGraphSchema } from "./session-graph";

export const SessionIdSchema = z
  .string()
  .trim()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Session ID must be URL-safe.");

export const MAX_CHARACTERS_PER_SESSION = 12;

export const SessionStateSchema = z.object({
  id: SessionIdSchema,
  version: VersionSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  phase: z.enum(["brief", "generating", "authoring", "approved", "playing", "ended"]),
  brief: SessionBriefSchema.optional(),
  graph: SessionGraphSchema.optional(),
  inkCompiled: z.string().optional(),
  inkState: z.string().optional(),
  worldState: z
    .object({
      cursorNodeId: z.string().optional(),
      clocks: z.record(z.string(), z.number().int()),
      flags: z.array(z.string()).default([]),
      vars: z.record(z.string(), z.any()).default({}),
      spotlightDebt: z.record(z.string(), z.number()).default({}),
      turnCount: z.number().int().default(0),
      lastDirectorMove: z
        .enum(["hard", "soft", "question", "cutscene", "none"])
        .default("none"),
      // Amendment O — Director runtime pacing state (added post review #2
      // round 2). Without these, the Director cannot detect stalls,
      // cannot do wall-clock pacing, and has no home for ephemeral
      // NPCs minted at play time via player-input-bridge.
      stallTicks: z.number().int().min(0).default(0),
      elapsedMinutes: z.number().int().min(0).default(0),
      ephemeralNpcs: z
        .array(
          z.object({
            id: z.string(),
            name: z.string().max(120),
            role: z.string().max(120),
            bornAtTick: z.number().int().min(0),
          })
        )
        .default([]),
    })
    .default({
      clocks: {},
      flags: [],
      vars: {},
      spotlightDebt: {},
      turnCount: 0,
      lastDirectorMove: "none",
      stallTicks: 0,
      elapsedMinutes: 0,
      ephemeralNpcs: [],
    }),
  characters: z
    .array(CharacterSheetParsedSchema)
    .max(MAX_CHARACTERS_PER_SESSION)
    .default([]),
});

export type SessionId = z.infer<typeof SessionIdSchema>;
export type SessionState = z.infer<typeof SessionStateSchema>;
export type WorldState = z.infer<typeof SessionStateSchema>["worldState"];
