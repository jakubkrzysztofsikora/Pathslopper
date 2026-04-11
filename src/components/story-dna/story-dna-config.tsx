"use client";

import * as React from "react";
import { useStoryDNAStore } from "@/lib/state/story-dna-store";
import { SliderRow } from "./slider-row";
import { FilterTags } from "./filter-tags";
import { cn } from "@/lib/utils/cn";
import { t, format } from "@/lib/i18n";

export interface StoryDNAConfigProps {
  className?: string;
}

export function StoryDNAConfig({ className }: StoryDNAConfigProps) {
  const {
    version,
    sliders,
    tags,
    setSlider,
    addIncludeTag,
    removeIncludeTag,
    addExcludeTag,
    removeExcludeTag,
  } = useStoryDNAStore();

  const versionLabel = version === "pf1e" ? "Pathfinder 1e" : "Pathfinder 2e";

  return (
    <section
      data-testid="story-dna-config"
      className={cn(
        "rounded-lg border border-zinc-700 bg-zinc-900 p-6",
        className
      )}
    >
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-zinc-100">
          {t("storyDna.heading")}
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          {format(t("storyDna.lead"), { versionLabel })}
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <SliderRow
          label={t("storyDna.pacingLabel")}
          description={t("storyDna.pacingDescription")}
          value={sliders.narrativePacing}
          onValueChange={(v) => setSlider("narrativePacing", v)}
        />
        <SliderRow
          label={t("storyDna.lethalityLabel")}
          description={t("storyDna.lethalityDescription")}
          value={sliders.tacticalLethality}
          onValueChange={(v) => setSlider("tacticalLethality", v)}
        />
        <SliderRow
          label={t("storyDna.improvLabel")}
          description={t("storyDna.improvDescription")}
          value={sliders.npcImprov}
          onValueChange={(v) => setSlider("npcImprov", v)}
        />

        <div className="border-t border-zinc-700 pt-6">
          <FilterTags
            includeTags={tags.include}
            excludeTags={tags.exclude}
            onAddInclude={addIncludeTag}
            onRemoveInclude={removeIncludeTag}
            onAddExclude={addExcludeTag}
            onRemoveExclude={removeExcludeTag}
          />
        </div>
      </div>
    </section>
  );
}
