"use client";

import type { Clock } from "@/lib/schemas/session-graph";
import type { WorldState } from "@/lib/schemas/session";
import { ClockWheel } from "@/components/authoring/clock-tracker";
import { t } from "@/lib/i18n";

interface ClockTrackerProps {
  clocks: Clock[];
  worldState: WorldState;
}

export function ClockTracker({ clocks, worldState }: ClockTrackerProps) {
  if (clocks.length === 0) return null;
  return (
    <div className="flex items-center gap-4 px-4 py-2 text-xs text-zinc-400">
      <span className="font-medium text-zinc-500">{t("play.headerClocks")}:</span>
      {clocks.map((clock) => (
        <div key={clock.id} className="flex flex-col items-center gap-0.5">
          <ClockWheel
            segments={clock.segments}
            filled={worldState.clocks[clock.id] ?? clock.filled}
            polarity={clock.polarity}
            size={36}
          />
          <span className="max-w-[60px] truncate text-[9px] text-zinc-500">{clock.label}</span>
        </div>
      ))}
    </div>
  );
}
