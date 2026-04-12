"use client";

import type { Clock } from "@/lib/schemas/session-graph";
import type { WorldState } from "@/lib/schemas/session";
import { t } from "@/lib/i18n";

interface ClockTrackerProps {
  clocks: Clock[];
  worldState: WorldState;
}

/** Simple segmented progress bar — clock visualization (div-based, upgradeable to SVG). */
function ClockWidget({ clock, filled }: { clock: Clock; filled: number }) {
  const polarityColor =
    clock.polarity === "danger"
      ? "bg-red-500"
      : clock.polarity === "opportunity"
      ? "bg-emerald-500"
      : "bg-amber-500";

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex gap-0.5">
        {Array.from({ length: clock.segments }).map((_, i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-sm border border-zinc-600 ${
              i < filled ? polarityColor : "bg-zinc-800"
            }`}
          />
        ))}
      </div>
      <span className="max-w-[80px] truncate text-[9px] text-zinc-500">{clock.label}</span>
    </div>
  );
}

export function ClockTracker({ clocks, worldState }: ClockTrackerProps) {
  if (clocks.length === 0) return null;
  return (
    <div className="flex items-center gap-3 px-4 py-2 text-xs text-zinc-400">
      <span className="font-medium text-zinc-500">{t("play.headerClocks")}:</span>
      {clocks.map((clock) => (
        <ClockWidget
          key={clock.id}
          clock={clock}
          filled={worldState.clocks[clock.id] ?? clock.filled}
        />
      ))}
    </div>
  );
}
