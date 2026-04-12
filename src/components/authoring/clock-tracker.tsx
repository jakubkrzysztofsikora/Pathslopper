"use client";

import { memo } from "react";
import type { Clock } from "@/lib/schemas/session-graph";

// ---------------------------------------------------------------------------
// SVG segmented clock wheel — Blades in the Dark style
// Segments are rendered as SVG path wedges. Filled segments are colored per
// clock polarity; unfilled segments are shown as empty arcs.
// ---------------------------------------------------------------------------

interface ClockWheelProps {
  segments: 4 | 6 | 8;
  filled: number;
  polarity: Clock["polarity"];
  size?: number;
}

const POLARITY_COLOR: Record<Clock["polarity"], string> = {
  danger: "#ef4444",
  opportunity: "#22c55e",
  neutral: "#d97706",
};

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number
): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function segmentPath(
  cx: number,
  cy: number,
  r: number,
  innerR: number,
  startAngle: number,
  endAngle: number
): string {
  const gap = 2; // degrees gap between segments
  const s = startAngle + gap / 2;
  const e = endAngle - gap / 2;

  const p1 = polarToCartesian(cx, cy, r, s);
  const p2 = polarToCartesian(cx, cy, r, e);
  const p3 = polarToCartesian(cx, cy, innerR, e);
  const p4 = polarToCartesian(cx, cy, innerR, s);

  const largeArc = e - s > 180 ? 1 : 0;

  return [
    `M ${p1.x} ${p1.y}`,
    `A ${r} ${r} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
    "Z",
  ].join(" ");
}

export const ClockWheel = memo(function ClockWheel({
  segments,
  filled,
  polarity,
  size = 48,
}: ClockWheelProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;
  const innerR = r * 0.4;
  const anglePerSeg = 360 / segments;
  const fillColor = POLARITY_COLOR[polarity] ?? "#d97706";

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label={`Zegar ${filled}/${segments}`}
      role="img"
    >
      {Array.from({ length: segments }).map((_, i) => {
        const startAngle = i * anglePerSeg;
        const endAngle = startAngle + anglePerSeg;
        const isFilled = i < filled;
        return (
          <path
            key={i}
            d={segmentPath(cx, cy, r, innerR, startAngle, endAngle)}
            fill={isFilled ? fillColor : "transparent"}
            stroke={fillColor}
            strokeWidth={1}
            opacity={isFilled ? 0.9 : 0.35}
          />
        );
      })}
    </svg>
  );
});

// ---------------------------------------------------------------------------
// ClockTracker — renders a list of clocks with SVG wheels
// ---------------------------------------------------------------------------

interface ClockTrackerProps {
  clocks: Clock[];
}

export function ClockTracker({ clocks }: ClockTrackerProps) {
  if (clocks.length === 0) return null;

  return (
    <ul className="space-y-2">
      {clocks.map((clock) => (
        <li key={clock.id} className="flex items-center gap-3">
          <ClockWheel
            segments={clock.segments}
            filled={clock.filled}
            polarity={clock.polarity}
            size={40}
          />
          <div className="flex-1 min-w-0">
            <p className="truncate text-xs font-medium text-zinc-300">{clock.label}</p>
            <p className="text-[10px] text-zinc-500">
              {clock.filled}/{clock.segments}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
