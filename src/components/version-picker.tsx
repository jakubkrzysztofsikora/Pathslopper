"use client";

import * as React from "react";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { useStoryDNAStore } from "@/lib/state/story-dna-store";
import type { PathfinderVersion } from "@/lib/schemas/version";

const VERSION_ITEMS = [
  {
    value: "pf1e" as PathfinderVersion,
    label: "Pathfinder 1e — Story-Forward Simulation",
  },
  {
    value: "pf2e" as PathfinderVersion,
    label: "Pathfinder 2e — Three-Action Economy",
  },
];

export function VersionPicker() {
  const { version, setVersion } = useStoryDNAStore();

  return (
    <div className="flex flex-col gap-3">
      <label className="text-xs font-semibold uppercase tracking-widest text-amber-500">
        Select Pathfinder Edition
      </label>
      <ToggleGroup
        value={version}
        onValueChange={(v) => setVersion(v as PathfinderVersion)}
        items={VERSION_ITEMS}
      />
    </div>
  );
}
