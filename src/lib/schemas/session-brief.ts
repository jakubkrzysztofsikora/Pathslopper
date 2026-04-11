import { z } from "zod";
import { VersionSchema } from "./version";
import { StoryDNASchema } from "./story-dna";

export const SessionBriefSchema = z.object({
  version: VersionSchema,
  partySize: z.number().int().min(1).max(8),
  partyLevel: z.number().int().min(1).max(20),
  targetDurationHours: z.number().int().min(3).max(10),
  tone: z.string().trim().max(200),
  setting: z.string().trim().max(500),
  presetId: z.enum(["classic", "intrigue", "horror", "custom"]),
  storyDna: StoryDNASchema,
  characterHooks: z
    .array(
      z.object({
        characterName: z.string().max(80),
        hook: z.string().max(400),
      })
    )
    .max(8)
    .default([]),
  // Amendment N — Lines & Veils honor.
  safetyTools: z
    .object({
      lines: z.array(z.string().max(100)).max(20).default([]),
      veils: z.array(z.string().max(100)).max(20).default([]),
      xCardEnabled: z.boolean().default(true),
    })
    .default({ lines: [], veils: [], xCardEnabled: true }),
  seed: z.number().int().optional(),
});

export type SessionBrief = z.infer<typeof SessionBriefSchema>;
