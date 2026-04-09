import { z } from "zod";
import { VersionSchema } from "./version";

const NonEmptyShort = z.string().trim().min(1).max(300);
const OptionalShort = z.string().trim().min(1).max(200).optional();

export const PlayerActionKindSchema = z.enum([
  "strike",
  "skill-check",
  "save",
  "cast-spell",
  "movement",
  "narrative",
]);

export type PlayerActionKind = z.infer<typeof PlayerActionKindSchema>;

/**
 * Structured output of Phase 2 (Input Optimization). A secondary LLM pass
 * cleans messy player prose ("I swing at the goblin with my longsword") into
 * an actionable intent the deterministic adjudicator can resolve.
 *
 * `modifier` and `dc` are optional overrides the player can supply directly
 * via the Player Input Console UI; the optimizer is instructed to leave them
 * undefined unless the prose explicitly contains numeric values.
 */
export const PlayerIntentSchema = z.object({
  version: VersionSchema,
  rawInput: NonEmptyShort,
  action: PlayerActionKindSchema,
  skillOrAttack: OptionalShort,
  target: OptionalShort,
  description: NonEmptyShort,
  modifier: z.number().int().finite().min(-20).max(40).optional(),
  dc: z.number().int().finite().min(1).max(60).optional(),
  /** Number of PF2e actions consumed by this intent (1-3). Unused for PF1e. */
  actionCost: z.number().int().min(1).max(3).optional(),
});

export type PlayerIntent = z.infer<typeof PlayerIntentSchema>;
