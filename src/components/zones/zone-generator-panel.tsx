"use client";

import * as React from "react";
import { useStoryDNAStore } from "@/lib/state/story-dna-store";
import { cn } from "@/lib/utils/cn";
import { t } from "@/lib/i18n";
import type { TacticalZone } from "@/lib/schemas/zone";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string; warnings?: string[]; markdown?: string }
  | {
      status: "success";
      markdown: string;
      zone: TacticalZone;
      warnings: string[];
    };

function formatApiError(error: unknown, fallback: string): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const flat = error as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
    const form = flat.formErrors?.join(", ");
    const fields = flat.fieldErrors
      ? Object.entries(flat.fieldErrors)
          .map(([k, v]) => `${k}: ${v.join(", ")}`)
          .join("; ")
      : "";
    const combined = [form, fields].filter((s) => s && s.length > 0).join(" | ");
    if (combined) return combined;
  }
  return fallback;
}

export interface ZoneGeneratorPanelProps {
  className?: string;
}

export function ZoneGeneratorPanel({ className }: ZoneGeneratorPanelProps) {
  const getSnapshot = useStoryDNAStore((s) => s.getSnapshot);
  const [biome, setBiome] = React.useState("flooded dungeon");
  const [encounterIntent, setEncounterIntent] = React.useState(
    "ambush by bandits"
  );
  const [state, setState] = React.useState<State>({ status: "idle" });
  const resultRef = React.useRef<HTMLDivElement>(null);
  const inFlightRef = React.useRef(false);

  React.useEffect(() => {
    if (state.status === "success" && resultRef.current) {
      resultRef.current.focus();
    }
  }, [state.status]);

  async function handleGenerate() {
    if (inFlightRef.current) return;
    const snapshot = getSnapshot();
    if (!snapshot.success) {
      // Distinct error from generic "zone generation failed" so the player
      // (and future support diagnostics) can tell a bad client state from
      // an upstream model/API failure.
      setState({
        status: "error",
        message: t("zones.invalidDnaState"),
      });
      return;
    }
    inFlightRef.current = true;
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/zones/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dna: snapshot.data,
          seed: { biome, encounterIntent },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setState({
          status: "error",
          message: formatApiError(json.error, t("zones.genericError")),
          warnings: Array.isArray(json.warnings) ? json.warnings : undefined,
          markdown: typeof json.markdown === "string" ? json.markdown : undefined,
        });
        return;
      }
      setState({
        status: "success",
        markdown: json.markdown,
        zone: json.zone as TacticalZone,
        warnings: Array.isArray(json.warnings) ? json.warnings : [],
      });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : t("zones.genericError"),
      });
    } finally {
      inFlightRef.current = false;
    }
  }

  return (
    <section
      className={cn(
        "rounded-lg border border-zinc-700 bg-zinc-900 p-6",
        className
      )}
      aria-labelledby="zone-generator-heading"
    >
      <div className="mb-4">
        <h2
          id="zone-generator-heading"
          className="text-lg font-semibold text-zinc-100"
        >
          {t("zones.heading")}
        </h2>
        <p className="text-sm text-zinc-300 mt-1">{t("zones.lead")}</p>
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-zinc-300">
            {t("zones.biomeLabel")}
          </span>
          <input
            type="text"
            value={biome}
            onChange={(e) => setBiome(e.target.value)}
            data-testid="zone-biome-input"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-zinc-300">
            {t("zones.intentLabel")}
          </span>
          <input
            type="text"
            value={encounterIntent}
            onChange={(e) => setEncounterIntent(e.target.value)}
            data-testid="zone-intent-input"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={state.status === "loading" || !biome || !encounterIntent}
          data-testid="zone-generate-button"
          className="self-start rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300"
        >
          {state.status === "loading"
            ? t("zones.generating")
            : t("zones.generate")}
        </button>

        {state.status === "error" && (
          <div className="rounded-md border border-red-800 bg-red-950/40 p-3" role="alert">
            <p className="text-sm text-red-300">{state.message}</p>
            {state.warnings && state.warnings.length > 0 && (
              <ul className="mt-2 text-xs text-amber-400">
                {state.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {state.status === "success" && (
          <div
            ref={resultRef}
            tabIndex={-1}
            aria-live="polite"
            className="rounded-md border border-zinc-700 bg-zinc-950 p-4 flex flex-col gap-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
            data-testid="zone-result"
          >
            <div>
              <h3 className="text-base font-semibold text-amber-400">
                {state.zone.name}
              </h3>
              <p className="text-xs text-zinc-300 mt-0.5">
                {state.zone.terrain} · {state.zone.lighting} · elevation{" "}
                {state.zone.elevation}
              </p>
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-wide text-zinc-300 mb-1">
                {t("zones.markdownHeading")}
              </h4>
              <pre className="text-xs text-zinc-200 whitespace-pre-wrap border border-zinc-800 rounded p-2 max-h-48 overflow-auto">
                {state.markdown}
              </pre>
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-wide text-zinc-300 mb-1">
                {t("zones.jsonHeading")}
              </h4>
              <pre className="text-xs text-zinc-200 whitespace-pre-wrap border border-zinc-800 rounded p-2 max-h-48 overflow-auto">
                {JSON.stringify(state.zone, null, 2)}
              </pre>
            </div>

            {state.warnings.length > 0 && (
              <ul className="border-t border-zinc-800 pt-2 text-xs text-amber-400">
                {state.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
