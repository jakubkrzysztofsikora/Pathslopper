import { z } from "zod";

// Cap base64-encoded images at ~6 MB decoded (8 MB encoded). Anthropic
// rejects much larger payloads upstream, but this guards the server
// against memory blow-up and rejects garbage before a paid call.
const MAX_IMAGE_BASE64_LENGTH = 8_000_000;
const BASE64_REGEX = /^[A-Za-z0-9+/=\s]+$/;

export const CharacterSheetVLMRequestSchema = z.object({
  imageBase64: z
    .string()
    .min(1, "imageBase64 must not be empty")
    .max(MAX_IMAGE_BASE64_LENGTH, "Image exceeds maximum size")
    .regex(BASE64_REGEX, "imageBase64 must be a valid base64 string"),
  mimeType: z.enum(["image/jpeg", "image/png", "image/gif", "image/webp"]),
  version: z.enum(["pf1e", "pf2e"]),
});

export type CharacterSheetVLMRequest = z.infer<typeof CharacterSheetVLMRequestSchema>;

const NonEmptyString = z.string().trim().min(1).max(200);
const AbilityScore = z.number().int().finite().min(1).max(40);
const LevelNumber = z.number().int().finite().min(1).max(30);
const ModifierNumber = z.number().int().finite().min(-20).max(40);

const AbilityScoresSchema = z.object({
  str: AbilityScore,
  dex: AbilityScore,
  con: AbilityScore,
  int: AbilityScore,
  wis: AbilityScore,
  cha: AbilityScore,
});

const PF1eCharacterSheetSchema = z.object({
  version: z.literal("pf1e"),
  name: NonEmptyString,
  race: NonEmptyString,
  classes: z.array(NonEmptyString).min(1).max(20),
  level: LevelNumber,
  feats: z.array(NonEmptyString).max(200),
  bab: ModifierNumber,
  saves: z.object({
    fortitude: ModifierNumber,
    reflex: ModifierNumber,
    will: ModifierNumber,
  }),
  abilityScores: AbilityScoresSchema,
});

const PF2eCharacterSheetSchema = z.object({
  version: z.literal("pf2e"),
  name: NonEmptyString,
  ancestry: NonEmptyString,
  background: NonEmptyString,
  class: NonEmptyString,
  level: LevelNumber,
  actionTags: z.array(NonEmptyString).max(200),
  proficiencies: z.record(
    NonEmptyString,
    z.enum(["untrained", "trained", "expert", "master", "legendary"])
  ),
  abilityScores: AbilityScoresSchema,
});

export const CharacterSheetParsedSchema = z.discriminatedUnion("version", [
  PF1eCharacterSheetSchema,
  PF2eCharacterSheetSchema,
]);

export type CharacterSheetParsed = z.infer<typeof CharacterSheetParsedSchema>;
export type PF1eCharacterSheet = z.infer<typeof PF1eCharacterSheetSchema>;
export type PF2eCharacterSheet = z.infer<typeof PF2eCharacterSheetSchema>;

export const IMAGE_BASE64_MAX_LENGTH = MAX_IMAGE_BASE64_LENGTH;
