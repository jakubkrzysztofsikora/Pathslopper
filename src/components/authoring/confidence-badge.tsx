"use client";

import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils/cn";

interface ConfidenceBadgeProps {
  warningCount: number;
}

export function ConfidenceBadge({ warningCount }: ConfidenceBadgeProps) {
  const isClean = warningCount === 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        isClean
          ? "bg-emerald-900/50 text-emerald-400"
          : "bg-amber-900/50 text-amber-400"
      )}
      title={t("authoring.confidenceBadgeLabel")}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", isClean ? "bg-emerald-400" : "bg-amber-400")} />
      {isClean
        ? t("authoring.confidenceBadgeLabel")
        : t("authoring.confidenceBadgeWarnings").replace("{count}", String(warningCount))}
    </span>
  );
}
