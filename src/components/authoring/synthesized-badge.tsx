"use client";

import type { Provenance } from "@/lib/schemas/session-graph";

const TOOLTIP =
  "Wymyślone przez AI (nie pochodzi z Twoich notatek) — sprawdź przed zatwierdzeniem.";

/**
 * Small inline badge rendered next to any field flagged as
 * `graph.provenance.synthesized[entityId]`. Editing the field should call
 * `clearSynthesizedPath` in the save handler so the badge disappears
 * after the GM reviews the value.
 */
export function SynthesizedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      role="status"
      title={TOOLTIP}
      aria-label={TOOLTIP}
      className={
        "inline-flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 " +
        "text-[10px] font-medium uppercase tracking-wide text-amber-300 " +
        className
      }
    >
      <span aria-hidden>⚠</span>
      <span>AI</span>
    </span>
  );
}

export function isSynthesized(
  provenance: Provenance | undefined,
  entityId: string,
  fieldPath: string
): boolean {
  if (!provenance) return false;
  const paths = provenance.synthesized[entityId];
  if (!paths || paths.length === 0) return false;
  if (paths.includes("*")) return true;
  return paths.includes(fieldPath);
}

/**
 * Remove a field's synthesized flag. If that was the last flag on the
 * entity (or the entity was wholly synthesized via `["*"]`), drop the
 * entity entirely. Pure — returns a new Provenance without mutating
 * the input.
 */
export function clearSynthesizedPath(
  provenance: Provenance | undefined,
  entityId: string,
  fieldPath: string
): Provenance {
  if (!provenance) return { synthesized: {} };
  const paths = provenance.synthesized[entityId];
  if (!paths) return provenance;

  // Whole-entity synthesis: any edit clears the flag entirely.
  if (paths.includes("*")) {
    const next = { ...provenance.synthesized };
    delete next[entityId];
    return { synthesized: next };
  }

  const filtered = paths.filter((p) => p !== fieldPath);
  const nextMap = { ...provenance.synthesized };
  if (filtered.length === 0) {
    delete nextMap[entityId];
  } else {
    nextMap[entityId] = filtered;
  }
  return { synthesized: nextMap };
}
