"use client";

import * as React from "react";
import { TagInput } from "@/components/ui/tag-input";
import { cn } from "@/lib/utils/cn";
import { t } from "@/lib/i18n";

export interface FilterTagsProps {
  includeTags: string[];
  excludeTags: string[];
  onAddInclude: (tag: string) => void;
  onRemoveInclude: (tag: string) => void;
  onAddExclude: (tag: string) => void;
  onRemoveExclude: (tag: string) => void;
  className?: string;
}

export function FilterTags({
  includeTags,
  excludeTags,
  onAddInclude,
  onRemoveInclude,
  onAddExclude,
  onRemoveExclude,
  className,
}: FilterTagsProps) {
  const includeHeadingId = "filter-tags-include-heading";
  const excludeHeadingId = "filter-tags-exclude-heading";

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div>
        <h4
          id={includeHeadingId}
          className="text-xs font-semibold uppercase tracking-widest text-amber-500 mb-2"
        >
          {t("storyDna.includeHeading")}
        </h4>
        <TagInput
          tags={includeTags}
          onAdd={onAddInclude}
          onRemove={onRemoveInclude}
          placeholder={t("storyDna.includePlaceholder")}
          labelledBy={includeHeadingId}
          chipClassName="border-amber-800 bg-amber-900/30 text-amber-300"
        />
      </div>
      <div>
        <h4
          id={excludeHeadingId}
          className="text-xs font-semibold uppercase tracking-widest text-zinc-300 mb-2"
        >
          {t("storyDna.excludeHeading")}
        </h4>
        <TagInput
          tags={excludeTags}
          onAdd={onAddExclude}
          onRemove={onRemoveExclude}
          placeholder={t("storyDna.excludePlaceholder")}
          labelledBy={excludeHeadingId}
          chipClassName="border-red-900 bg-red-900/20 text-red-400"
        />
      </div>
    </div>
  );
}
