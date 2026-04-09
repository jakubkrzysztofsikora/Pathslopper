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

const ShortIdent = z.string().trim().min(1).max(120);
const ShortName = z.string().trim().min(1).max(200);
const Description = z.string().trim().min(1).max(1000);
const Hazard = z.string().trim().min(1).max(200);

export const CoverObjectSchema = z.object({
  id: ShortIdent,
  name: ShortName,
  coverBonus: z.number().int().finite().min(0).max(10).optional(),
  description: Description,
});

export const TacticalZoneSchema = z.object({
  id: ShortIdent,
  name: ShortName,
  terrain: TerrainTypeSchema,
  cover: z.array(CoverObjectSchema).max(32),
  elevation: z.number().int().finite().min(-1000).max(10000),
  hazards: z.array(Hazard).max(32),
  lighting: LightingConditionSchema,
  pf2eActionCost: z.number().int().finite().min(0).max(3).optional(),
  pf1eMovementCost: z.number().int().finite().min(0).max(200).optional(),
});

export type TacticalZone = z.infer<typeof TacticalZoneSchema>;
export type TerrainType = z.infer<typeof TerrainTypeSchema>;
export type LightingCondition = z.infer<typeof LightingConditionSchema>;
export type CoverObject = z.infer<typeof CoverObjectSchema>;
