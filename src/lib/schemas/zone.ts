import { z } from "zod";

export const TerrainTypeSchema = z.enum([
  "open",
  "difficult",
  "water",
  "urban",
  "forest",
  "underground",
  "aerial",
  "desert",
  "arctic",
  "swamp",
]);

export const LightingConditionSchema = z.enum([
  "bright",
  "normal",
  "dim",
  "darkness",
]);

export const CoverObjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  coverBonus: z.number().optional(),
  description: z.string(),
});

export const TacticalZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  terrain: TerrainTypeSchema,
  cover: z.array(CoverObjectSchema),
  elevation: z.number(),
  hazards: z.array(z.string()),
  lighting: LightingConditionSchema,
  pf2eActionCost: z.number().optional(),
  pf1eMovementCost: z.number().optional(),
});

export type TacticalZone = z.infer<typeof TacticalZoneSchema>;
export type TerrainType = z.infer<typeof TerrainTypeSchema>;
export type LightingCondition = z.infer<typeof LightingConditionSchema>;
export type CoverObject = z.infer<typeof CoverObjectSchema>;
