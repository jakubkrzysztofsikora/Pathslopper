"use client";

import * as React from "react";
import { useStoryDNAStore } from "@/lib/state/story-dna-store";
import { cn } from "@/lib/utils/cn";
import type { AdjudicationResult } from "@/lib/schemas/adjudication";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; result: AdjudicationResult };

function formatApiError(error: unknown, fallback: string): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const flat = error as {
      formErrors?: string[];
      fieldErrors?: Record<string, string[]>;
    };
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

function parseOptionalInt(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

export interface PlayerInputConsoleProps {
  className?: string;
}

export function PlayerInputConsole({ className }: PlayerInputConsoleProps) {
  const version = useStoryDNAStore((s) => s.version);
  const [rawInput, setRawInput] = React.useState(
    "I swing my longsword at the nearest goblin."
  );
  const [modifierStr, setModifierStr] = React.useState("5");
  const [dcStr, setDcStr] = React.useState("15");
  const [state, setState] = React.useState<State>({ status: "idle" });
  const resultRef = React.useRef<HTMLDivElement>(null);
  const inFlightRef = React.useRef(false);

  React.useEffect(() => {
    if (state.status === "success" && resultRef.current) {
      resultRef.current.focus();
    }
  }, [state.status]);

  async function handleResolve() {
    if (inFlightRef.current) return;
    if (rawInput.trim().length === 0) return;
    inFlightRef.current = true;
    setState({ status: "loading" });
    try {
      const body = {
        rawInput,
        version,
        overrideModifier: parseOptionalInt(modifierStr),
        overrideDc: parseOptionalInt(dcStr),
      };
      const res = await fetch("/api/interaction/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setState({
          status: "error",
          message: formatApiError(json.error, "Resolution failed."),
        });
        return;
      }
      setState({
        status: "success",
        result: json.result as AdjudicationResult,
      });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Request failed.",
      });
    } finally {
      inFlightRef.current = false;
    }
  }

  const degreeBadgeClass = (
    degree?: string
  ): string => {
    switch (degree) {
      case "critical-success":
        return "bg-emerald-900/40 text-emerald-300 border-emerald-700";
      case "success":
        return "bg-emerald-900/20 text-emerald-400 border-emerald-800";
      case "failure":
        return "bg-red-900/20 text-red-400 border-red-800";
      case "critical-failure":
        return "bg-red-900/40 text-red-300 border-red-700";
      default:
        return "bg-zinc-800 text-zinc-200 border-zinc-700";
    }
  };

  return (
    <section
      className={cn(
        "rounded-lg border border-zinc-700 bg-zinc-900 p-6",
        className
      )}
      aria-labelledby="player-input-console-heading"
    >
      <div className="mb-4">
        <h2
          id="player-input-console-heading"
          className="text-lg font-semibold text-zinc-100"
        >
          Player Input Console — Audit the Math
        </h2>
        <p className="text-sm text-zinc-300 mt-1">
          Phase 2 cleans your prose into a PlayerIntent via Claude. Phase 3
          adjudicates the intent against a deterministic dice engine. Every
          modifier and roll is shown below — no hidden math.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-zinc-300">
            Player action (free text)
          </span>
          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            data-testid="player-input-textarea"
            rows={3}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
          />
        </label>

        <div className="flex gap-3">
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-xs uppercase tracking-wide text-zinc-300">
              Modifier (optional)
            </span>
            <input
              type="number"
              value={modifierStr}
              onChange={(e) => setModifierStr(e.target.value)}
              data-testid="player-input-modifier"
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-xs uppercase tracking-wide text-zinc-300">
              DC / AC (optional)
            </span>
            <input
              type="number"
              value={dcStr}
              onChange={(e) => setDcStr(e.target.value)}
              data-testid="player-input-dc"
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => void handleResolve()}
          disabled={state.status === "loading" || rawInput.trim().length === 0}
          data-testid="player-input-resolve-button"
          className="self-start rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300"
        >
          {state.status === "loading" ? "Resolving..." : "Resolve Action"}
        </button>

        {state.status === "error" && (
          <p className="text-sm text-red-400" role="alert">
            {state.message}
          </p>
        )}

        {state.status === "success" && (
          <div
            ref={resultRef}
            tabIndex={-1}
            aria-live="polite"
            className="rounded-md border border-zinc-700 bg-zinc-950 p-4 flex flex-col gap-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
            data-testid="player-input-result"
          >
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <h3 className="text-base font-semibold text-amber-400">
                Intent: {state.result.intent.action}
                {state.result.intent.skillOrAttack &&
                  ` · ${state.result.intent.skillOrAttack}`}
              </h3>
              {state.result.roll.degreeOfSuccess && (
                <span
                  className={cn(
                    "text-xs uppercase tracking-wide px-2 py-0.5 rounded border",
                    degreeBadgeClass(state.result.roll.degreeOfSuccess)
                  )}
                  data-testid="player-input-degree-badge"
                >
                  {state.result.roll.degreeOfSuccess.replace("-", " ")}
                </span>
              )}
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-wide text-zinc-300 mb-1">
                Audit the Math
              </h4>
              <pre
                data-testid="player-input-audit"
                className="text-xs text-amber-300 whitespace-pre-wrap border border-zinc-800 rounded p-2"
              >
                {state.result.roll.breakdown}
              </pre>
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-wide text-zinc-300 mb-1">
                Summary
              </h4>
              <p className="text-sm text-zinc-100">{state.result.summary}</p>
            </div>

            <details className="text-xs text-zinc-300">
              <summary className="cursor-pointer text-zinc-300 hover:text-amber-400">
                Full AdjudicationResult JSON
              </summary>
              <pre className="mt-2 whitespace-pre-wrap text-zinc-200 border border-zinc-800 rounded p-2 overflow-auto max-h-48">
                {JSON.stringify(state.result, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </section>
  );
}
