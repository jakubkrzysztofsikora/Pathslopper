import type { StoryDNA, SliderValues } from "@/lib/schemas/story-dna";
import { VERSION_SLIDER_DEFAULTS } from "@/lib/schemas/story-dna";
import type { PathfinderVersion } from "@/lib/schemas/version";
import { DEFAULT_BANNED_PHRASES } from "@/lib/prompts/banned-phrases";

/**
 * Quick-start Story DNA presets for the new-session wizard.
 *
 * Each preset encodes an (internal) id, i18n key prefixes, and a
 * builder that produces a full `StoryDNA` object for the chosen
 * Pathfinder version. The builder is version-aware because the
 * three slider dimensions have slightly different "neutral" baselines
 * for PF1e vs PF2e (see VERSION_SLIDER_DEFAULTS).
 *
 * We deliberately keep these hand-authored rather than sampled from a
 * dataset: UX research (see .claude/skills/ux-designer) shows that
 * a small number of clearly-differentiated starting points beats a
 * grid of similar choices for first-time users.
 */

export type PresetId = "classic" | "intrigue" | "horror" | "custom";

export interface StoryPreset {
  id: PresetId;
  titleKey: "presets.classicTitle" | "presets.intrigueTitle" | "presets.horrorTitle" | "wizard.stylePresetCustom";
  bodyKey: "presets.classicBody" | "presets.intrigueBody" | "presets.horrorBody" | "wizard.stylePresetCustomDescription";
  tagKey?: "presets.classicTag" | "presets.intrigueTag" | "presets.horrorTag";
  /** Returns a full StoryDNA. Null = "use whatever is already in the store". */
  build: (version: PathfinderVersion) => StoryDNA | null;
}

function merge(base: SliderValues, overrides: Partial<SliderValues>): SliderValues {
  return { ...base, ...overrides };
}

export const STORY_PRESETS: StoryPreset[] = [
  {
    id: "classic",
    titleKey: "presets.classicTitle",
    bodyKey: "presets.classicBody",
    tagKey: "presets.classicTag",
    build: (version) => ({
      version,
      sliders: VERSION_SLIDER_DEFAULTS[version],
      tags: {
        include: ["Heroiczna wyprawa", "Eksploracja"],
        exclude: [...DEFAULT_BANNED_PHRASES],
      },
    }),
  },
  {
    id: "intrigue",
    titleKey: "presets.intrigueTitle",
    bodyKey: "presets.intrigueBody",
    tagKey: "presets.intrigueTag",
    build: (version) => ({
      version,
      sliders: merge(VERSION_SLIDER_DEFAULTS[version], {
        narrativePacing: 80,
        tacticalLethality: 25,
        npcImprov: 85,
      }),
      tags: {
        include: ["Intryga dworska", "Dialog", "Wpływy rodów"],
        exclude: [...DEFAULT_BANNED_PHRASES],
      },
    }),
  },
  {
    id: "horror",
    titleKey: "presets.horrorTitle",
    bodyKey: "presets.horrorBody",
    tagKey: "presets.horrorTag",
    build: (version) => ({
      version,
      sliders: merge(VERSION_SLIDER_DEFAULTS[version], {
        narrativePacing: 55,
        tacticalLethality: 85,
        npcImprov: 60,
      }),
      tags: {
        include: ["Kosmiczna groza", "Mgła", "Rytuały"],
        exclude: [...DEFAULT_BANNED_PHRASES],
      },
    }),
  },
  {
    id: "custom",
    titleKey: "wizard.stylePresetCustom",
    bodyKey: "wizard.stylePresetCustomDescription",
    build: () => null,
  },
];

export function findPreset(id: PresetId): StoryPreset | undefined {
  return STORY_PRESETS.find((p) => p.id === id);
}
