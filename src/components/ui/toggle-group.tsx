"use client";

import * as React from "react";
import * as RadixToggleGroup from "@radix-ui/react-toggle-group";
import { cn } from "@/lib/utils/cn";

export interface ToggleGroupItem {
  value: string;
  label: string;
}

export interface ToggleGroupProps {
  value: string;
  onValueChange: (value: string) => void;
  items: ToggleGroupItem[];
  className?: string;
}

export function ToggleGroup({
  value,
  onValueChange,
  items,
  className,
}: ToggleGroupProps) {
  return (
    <RadixToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => {
        if (v) onValueChange(v);
      }}
      className={cn("flex gap-2 flex-wrap", className)}
    >
      {items.map((item) => (
        <RadixToggleGroup.Item
          key={item.value}
          value={item.value}
          data-testid={`version-${item.value}`}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-colors",
            "border border-zinc-700 bg-zinc-800 text-zinc-300",
            "hover:bg-zinc-700 hover:text-zinc-100",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
            "data-[state=on]:border-amber-500 data-[state=on]:bg-amber-500/10 data-[state=on]:text-amber-400"
          )}
        >
          {item.label}
        </RadixToggleGroup.Item>
      ))}
    </RadixToggleGroup.Root>
  );
}
