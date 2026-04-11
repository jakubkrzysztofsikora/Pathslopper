import * as React from "react";
import { cn } from "@/lib/utils/cn";

type Tone = "neutral" | "amber" | "emerald" | "red";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

const toneClass: Record<Tone, string> = {
  neutral: "border-zinc-700 bg-zinc-800 text-zinc-200",
  amber: "border-amber-700 bg-amber-900/20 text-amber-300",
  emerald: "border-emerald-700 bg-emerald-900/20 text-emerald-300",
  red: "border-red-700 bg-red-900/20 text-red-300",
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        toneClass[tone],
        className
      )}
      {...props}
    />
  );
}
