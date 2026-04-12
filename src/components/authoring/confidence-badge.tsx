"use client";

import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils/cn";

interface ConfidenceBadgeProps {
  /** Raw validation warning count */
  warningCount: number;
  /** Number of stat block values that were clamped during generation */
  statBlockClamps?: number;
  /** Number of Three-Clue Rule violations detected */
  threeClueViolations?: number;
}

/**
 * Amendment U confidence score formula:
 *   score = 100 - (validationWarnings × 5) - (statBlockClamps × 10) - (threeClueViolations × 5)
 * Clamped to [0, 100].
 * ≥90 → green, 60-89 → amber, <60 → red.
 */
function computeScore(
  warningCount: number,
  statBlockClamps: number,
  threeClueViolations: number
): number {
  const raw =
    100 -
    warningCount * 5 -
    statBlockClamps * 10 -
    threeClueViolations * 5;
  return Math.max(0, Math.min(100, raw));
}

export function ConfidenceBadge({
  warningCount,
  statBlockClamps = 0,
  threeClueViolations = 0,
}: ConfidenceBadgeProps) {
  const score = computeScore(warningCount, statBlockClamps, threeClueViolations);

  const colorClass =
    score >= 90
      ? "bg-emerald-900/50 text-emerald-400"
      : score >= 60
      ? "bg-amber-900/50 text-amber-400"
      : "bg-red-900/50 text-red-400";

  const dotClass =
    score >= 90
      ? "bg-emerald-400"
      : score >= 60
      ? "bg-amber-400"
      : "bg-red-400";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        colorClass
      )}
      title={t("authoring.confidenceBadgeLabel")}
      data-testid="confidence-badge"
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
      {score}%
    </span>
  );
}
