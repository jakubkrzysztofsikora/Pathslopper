"use client";

import * as React from "react";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { useStoryDNAStore } from "@/lib/state/story-dna-store";
import { t } from "@/lib/i18n";
import type { PathfinderVersion } from "@/lib/schemas/version";

export function VersionPicker() {
  // Subscribe to the minimum slice each piece of UI needs, not the whole
  // Story DNA store — tweaking sliders elsewhere must not rerender the
  // version picker.
  const version = useStoryDNAStore((s) => s.version);
  const setVersion = useStoryDNAStore((s) => s.setVersion);

  // Items are computed inside the component so they always reflect the
  // current dictionary (the `t()` helper is module-scope in CSR and server
  // components alike — no React context needed).
  const items = React.useMemo(
    () => [
      {
        value: "pf1e" as PathfinderVersion,
        label: t("versionPicker.pf1eLabel"),
      },
      {
        value: "pf2e" as PathfinderVersion,
        label: t("versionPicker.pf2eLabel"),
      },
    ],
    []
  );

  return (
    <div className="flex flex-col gap-3" data-testid="version-picker">
      <label className="text-xs font-semibold uppercase tracking-widest text-amber-500">
        {t("versionPicker.heading")}
      </label>
      <ToggleGroup
        value={version}
        onValueChange={(v) => setVersion(v as PathfinderVersion)}
        items={items}
      />
    </div>
  );
}
