import { z } from "zod";

export const CharacterSheetVLMRequestSchema = z.object({
  imageBase64: z.string(),
  mimeType: z.enum(["image/jpeg", "image/png", "image/gif", "image/webp"]),
  version: z.enum(["pf1e", "pf2e"]),
});

export type CharacterSheetVLMRequest = z.infer<typeof CharacterSheetVLMRequestSchema>;

const PF1eCharacterSheetSchema = z.object({
  version: z.literal("pf1e"),
  name: z.string(),
  race: z.string(),
  classes: z.array(z.string()),
  level: z.number(),
  feats: z.array(z.string()),
  bab: z.number(),
  saves: z.object({
    fortitude: z.number(),
    reflex: z.number(),
    will: z.number(),
  }),
  abilityScores: z.object({
    str: z.number(),
    dex: z.number(),
    con: z.number(),
    int: z.number(),
    wis: z.number(),
    cha: z.number(),
  }),
});

const PF2eCharacterSheetSchema = z.object({
  version: z.literal("pf2e"),
  name: z.string(),
  ancestry: z.string(),
  background: z.string(),
  class: z.string(),
  level: z.number(),
  actionTags: z.array(z.string()),
  proficiencies: z.record(z.string(), z.enum(["untrained", "trained", "expert", "master", "legendary"])),
  abilityScores: z.object({
    str: z.number(),
    dex: z.number(),
    con: z.number(),
    int: z.number(),
    wis: z.number(),
    cha: z.number(),
  }),
});

export const CharacterSheetParsedSchema = z.discriminatedUnion("version", [
  PF1eCharacterSheetSchema,
  PF2eCharacterSheetSchema,
]);

export type CharacterSheetParsed = z.infer<typeof CharacterSheetParsedSchema>;
export type PF1eCharacterSheet = z.infer<typeof PF1eCharacterSheetSchema>;
export type PF2eCharacterSheet = z.infer<typeof PF2eCharacterSheetSchema>;
