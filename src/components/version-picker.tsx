"use client";

import * as React from "react";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { useStoryDNAStore } from "@/lib/state/story-dna-store";
import type { PathfinderVersion } from "@/lib/schemas/version";

const VERSION_ITEMS = [
  {
    value: "pf1e" as PathfinderVersion,
    label: "Pathfinder 1e — symulacja fabularna",
  },
  {
    value: "pf2e" as PathfinderVersion,
    label: "Pathfinder 2e — system trzech akcji",
  },
];

export function VersionPicker() {
  const { version, setVersion } = useStoryDNAStore();

  return (
    <div className="flex flex-col gap-3" data-testid="version-picker">
      <label className="text-xs font-semibold uppercase tracking-widest text-amber-500">
        Wybierz edycję Pathfindera
      </label>
      <ToggleGroup
        value={version}
        onValueChange={(v) => setVersion(v as PathfinderVersion)}
        items={VERSION_ITEMS}
      />
    </div>
  );
}
