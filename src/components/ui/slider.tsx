"use client";

import * as React from "react";
import * as RadixSlider from "@radix-ui/react-slider";
import { cn } from "@/lib/utils/cn";

export interface SliderProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  "aria-label"?: string;
}

export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  className,
  "aria-label": ariaLabel,
}: SliderProps) {
  return (
    <RadixSlider.Root
      className={cn(
        "relative flex touch-none select-none items-center w-full",
        className
      )}
      value={[value]}
      onValueChange={([v]) => onValueChange(v)}
      min={min}
      max={max}
      step={step}
    >
      <RadixSlider.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-zinc-700">
        <RadixSlider.Range className="absolute h-full bg-amber-500" />
      </RadixSlider.Track>
      <RadixSlider.Thumb
        aria-label={ariaLabel}
        className={cn(
          "block h-4 w-4 rounded-full border-2 border-amber-500 bg-zinc-900",
          "ring-offset-zinc-950 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:opacity-50"
        )}
      />
    </RadixSlider.Root>
  );
}
