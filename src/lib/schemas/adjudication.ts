import { z } from "zod";
import { PlayerIntentSchema } from "./player-intent";

const ModifierTermSchema = z.object({
  label: z.string().min(1).max(60),
  value: z.number().int().finite().min(-40).max(40),
});

export const RollResultSchema = z.object({
  formula: z.string(),
  rolls: z.array(z.number().int()),
  modifiers: z.array(ModifierTermSchema),
  total: z.number().int(),
  breakdown: z.string(),
});

export const DegreeOfSuccessSchema = z.enum([
  "critical-failure",
  "failure",
  "success",
  "critical-success",
]);

/**
 * The resolved outcome of Phase 3 (Adjudication). Carries the optimized
 * intent, the full dice roll audit trail, and the verdict. The UI renders
 * `roll.breakdown` verbatim as the "Audit the Math" panel.
 */
export const AdjudicationResultSchema = z.object({
  intent: PlayerIntentSchema,
  roll: RollResultSchema.extend({
    dc: z.number().int().optional(),
    degreeOfSuccess: DegreeOfSuccessSchema.optional(),
  }),
  outcome: z.enum(["resolved", "narrative", "needs-dc"]),
  summary: z.string(),
});

export type AdjudicationResult = z.infer<typeof AdjudicationResultSchema>;
export type DegreeOfSuccess = z.infer<typeof DegreeOfSuccessSchema>;
