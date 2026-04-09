import { z } from "zod";
import { VersionSchema, type PathfinderVersion } from "./version";

export const SliderValuesSchema = z.object({
  narrativePacing: z.number().min(0).max(100),
  tacticalLethality: z.number().min(0).max(100),
  npcImprov: z.number().min(0).max(100),
});

export type SliderValues = z.infer<typeof SliderValuesSchema>;

export const StoryDNASchema = z.object({
  version: VersionSchema,
  sliders: SliderValuesSchema,
  tags: z.object({
    include: z.array(z.string()),
    exclude: z.array(z.string()),
  }),
});

export type StoryDNA = z.infer<typeof StoryDNASchema>;

export const VERSION_SLIDER_DEFAULTS: Record<PathfinderVersion, SliderValues> = {
  pf1e: {
    narrativePacing: 60,
    tacticalLethality: 40,
    npcImprov: 70,
  },
  pf2e: {
    narrativePacing: 50,
    tacticalLethality: 55,
    npcImprov: 50,
  },
};
