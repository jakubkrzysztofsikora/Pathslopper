"use client";

import * as React from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils/cn";

export interface SliderRowProps {
  label: string;
  description: string;
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  className?: string;
}

export function SliderRow({
  label,
  description,
  value,
  onValueChange,
  min = 0,
  max = 100,
  className,
}: SliderRowProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-zinc-200">{label}</span>
          <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
        </div>
        <span className="text-sm font-mono text-amber-400 tabular-nums min-w-[2.5rem] text-right">
          {value}
        </span>
      </div>
      <Slider
        value={value}
        onValueChange={onValueChange}
        min={min}
        max={max}
        aria-label={label}
      />
    </div>
  );
}
