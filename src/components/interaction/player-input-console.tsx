"use client";

import * as React from "react";
import { useStoryDNAStore } from "@/lib/state/story-dna-store";
import { cn } from "@/lib/utils/cn";
import type { AdjudicationResult } from "@/lib/schemas/adjudication";
import type { SessionState, Turn } from "@/lib/schemas/session";

type State =
  | { status: "idle" }
  | { status: "loading-resolve" }
  | { status: "loading-narrate" }
  | { status: "loading-summarize" }
  | { status: "loading-override" }
  | { status: "error"; message: string }
  | { status: "success"; result: AdjudicationResult };

const SESSION_STORAGE_KEY = "pathfinder-nexus:sessionId";

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

function degreeBadgeClass(degree?: string): string {
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
}

function TurnEntry({ turn, index }: { turn: Turn; index: number }) {
  if (turn.kind === "narration") {
    return (
      <li
        className="border-l-2 border-amber-700 pl-3 py-2 text-xs text-zinc-200"
        data-testid={`session-turn-${index}`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-amber-400 uppercase tracking-wide">
            Narration
          </span>
          <span className="text-zinc-400">
            world-state {turn.worldStateHash}
          </span>
        </div>
        <pre className="whitespace-pre-wrap font-sans text-zinc-100">
          {turn.markdown}
        </pre>
      </li>
    );
  }
  if (turn.kind === "manager-override") {
    return (
      <li
        className="border-l-2 border-red-700 pl-3 py-2 text-xs text-zinc-200"
        data-testid={`session-turn-${index}`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-red-400 uppercase tracking-wide">
            Manager Override
          </span>
        </div>
        <p className="text-zinc-300 italic">{turn.summary}</p>
        <p className="mt-1 text-zinc-100 font-medium">{turn.forcedOutcome}</p>
      </li>
    );
  }
  const degree = turn.result.roll.degreeOfSuccess;
  return (
    <li
      className="border-l-2 border-zinc-600 pl-3 py-2 text-xs text-zinc-200"
      data-testid={`session-turn-${index}`}
    >
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <span className="text-zinc-400 uppercase tracking-wide">
          {turn.intent.action}
          {turn.intent.skillOrAttack && ` · ${turn.intent.skillOrAttack}`}
        </span>
        {degree && (
          <span
            className={cn(
              "text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border",
              degreeBadgeClass(degree)
            )}
          >
            {degree.replace("-", " ")}
          </span>
        )}
      </div>
      <p className="italic text-zinc-300">&ldquo;{turn.intent.rawInput}&rdquo;</p>
      <pre className="mt-1 text-amber-300 whitespace-pre-wrap font-mono">
        {turn.result.roll.breakdown || "(no roll)"}
      </pre>
      <p className="mt-1 text-zinc-200">{turn.result.summary}</p>
    </li>
  );
}

export interface PlayerInputConsoleProps {
  className?: string;
}

export function PlayerInputConsole({ className }: PlayerInputConsoleProps) {
  const version = useStoryDNAStore((s) => s.version);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [session, setSession] = React.useState<SessionState | null>(null);
  const [rawInput, setRawInput] = React.useState(
    "I swing my longsword at the nearest goblin."
  );
  const [modifierStr, setModifierStr] = React.useState("5");
  const [dcStr, setDcStr] = React.useState("15");
  const [characterName, setCharacterName] = React.useState<string>("");
  const [state, setState] = React.useState<State>({ status: "idle" });
  const [fourthWallOpen, setFourthWallOpen] = React.useState(false);
  const [lastN, setLastN] = React.useState("5");
  const [deadlockSummary, setDeadlockSummary] = React.useState<string | null>(null);
  const [forcedOutcome, setForcedOutcome] = React.useState("");
  const [overrideActive, setOverrideActive] = React.useState(false);
  const resultRef = React.useRef<HTMLDivElement>(null);
  const inFlightRef = React.useRef(false);

  // Rehydrate a previously-created session ID from sessionStorage so a
  // page refresh doesn't silently orphan the server-side log.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) setSessionId(stored);
  }, []);

  React.useEffect(() => {
    if (sessionId && typeof window !== "undefined") {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    }
  }, [sessionId]);

  React.useEffect(() => {
    if (state.status === "success" && resultRef.current) {
      resultRef.current.focus();
    }
  }, [state.status]);

  async function ensureSession(): Promise<string | null> {
    if (sessionId) return sessionId;
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setState({
          status: "error",
          message: formatApiError(json.error, "Could not create session."),
        });
        return null;
      }
      const newSession = json.session as SessionState;
      setSessionId(newSession.id);
      setSession(newSession);
      return newSession.id;
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Session create failed.",
      });
      return null;
    }
  }

  async function handleResolve() {
    if (inFlightRef.current) return;
    if (rawInput.trim().length === 0) return;
    const sid = await ensureSession();
    if (!sid) return;

    inFlightRef.current = true;
    setState({ status: "loading-resolve" });
    try {
      const body: Record<string, unknown> = {
        rawInput,
        version,
        overrideModifier: parseOptionalInt(modifierStr),
        overrideDc: parseOptionalInt(dcStr),
        sessionId: sid,
      };
      if (characterName) {
        body.characterName = characterName;
      }
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
      if (json.session) setSession(json.session as SessionState);
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Request failed.",
      });
    } finally {
      inFlightRef.current = false;
    }
  }

  async function handleNarrate() {
    if (inFlightRef.current) return;
    const sid = await ensureSession();
    if (!sid) return;

    inFlightRef.current = true;
    setState({ status: "loading-narrate" });
    try {
      const res = await fetch("/api/interaction/narrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, persist: true }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setState({
          status: "error",
          message: formatApiError(json.error, "Narration failed."),
        });
        return;
      }
      if (json.session) setSession(json.session as SessionState);
      setState({ status: "idle" });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Narration failed.",
      });
    } finally {
      inFlightRef.current = false;
    }
  }

  function handleResetSession() {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
    setSessionId(null);
    setSession(null);
    setState({ status: "idle" });
  }

  async function handleSummarize() {
    if (inFlightRef.current) return;
    const sid = sessionId;
    if (!sid) return;
    inFlightRef.current = true;
    setState({ status: "loading-summarize" });
    try {
      const n = parseInt(lastN, 10);
      const res = await fetch(`/api/sessions/${sid}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "summarize", lastN: Number.isFinite(n) ? n : 5 }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setState({
          status: "error",
          message: formatApiError(json.error, "Summarization failed."),
        });
        return;
      }
      setDeadlockSummary(json.summary as string);
      setState({ status: "idle" });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Summarization failed.",
      });
    } finally {
      inFlightRef.current = false;
    }
  }

  async function handleForceOutcome() {
    if (inFlightRef.current) return;
    if (forcedOutcome.trim().length === 0) return;
    const sid = await ensureSession();
    if (!sid) return;
    inFlightRef.current = true;
    setState({ status: "loading-override" });
    try {
      const n = parseInt(lastN, 10);
      const turnsConsidered = Number.isFinite(n) ? n : 5;
      const summary = deadlockSummary ?? "Manager override.";
      const res = await fetch(`/api/sessions/${sid}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "force",
          forcedOutcome: forcedOutcome.trim(),
          summary,
          turnsConsidered,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setState({
          status: "error",
          message: formatApiError(json.error, "Override failed."),
        });
        return;
      }
      if (json.session) setSession(json.session as SessionState);
      setOverrideActive(true);
      setForcedOutcome("");
      setDeadlockSummary(null);
      setFourthWallOpen(false);
      setState({ status: "idle" });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Override failed.",
      });
    } finally {
      inFlightRef.current = false;
    }
  }

  const isLoading =
    state.status === "loading-resolve" ||
    state.status === "loading-narrate" ||
    state.status === "loading-summarize" ||
    state.status === "loading-override";

  return (
    <section
      className={cn(
        "rounded-lg border border-zinc-700 bg-zinc-900 p-6",
        className
      )}
      aria-labelledby="player-input-console-heading"
    >
      <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2
            id="player-input-console-heading"
            className="text-lg font-semibold text-zinc-100"
          >
            Player Input Console — Audit the Math
          </h2>
          <p className="text-sm text-zinc-300 mt-1">
            Phase 1 narrates the scene. Phase 2 cleans your prose into a
            PlayerIntent. Phase 3 adjudicates deterministically. Phase 4
            appends the turn to the server-owned session log.
          </p>
        </div>
        {sessionId && (
          <div className="text-xs text-zinc-400 font-mono flex items-center gap-2">
            <span data-testid="session-id-display">
              session {sessionId.slice(0, 8)}…
            </span>
            <button
              type="button"
              onClick={handleResetSession}
              className="text-amber-400 hover:text-amber-300 underline"
              data-testid="session-reset-button"
            >
              reset
            </button>
          </div>
        )}
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

        <div className="flex gap-3 flex-wrap">
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
          {session?.characters && session.characters.length > 0 && (
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-xs uppercase tracking-wide text-zinc-300">
                Character (optional)
              </span>
              <select
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
                data-testid="player-input-character"
                className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
              >
                <option value="">— none —</option>
                {session.characters.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => void handleResolve()}
            disabled={isLoading || rawInput.trim().length === 0}
            data-testid="player-input-resolve-button"
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300"
          >
            {state.status === "loading-resolve" ? "Resolving..." : "Resolve Action"}
          </button>
          <button
            type="button"
            onClick={() => void handleNarrate()}
            disabled={isLoading}
            data-testid="player-input-narrate-button"
            className="rounded-md border border-amber-600 px-4 py-2 text-sm font-medium text-amber-400 hover:bg-amber-900/20 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-500"
          >
            {state.status === "loading-narrate" ? "Narrating..." : "Narrate Scene"}
          </button>
          <button
            type="button"
            onClick={() => setFourthWallOpen((o) => !o)}
            disabled={isLoading}
            data-testid="player-input-fourth-wall-button"
            className={cn(
              "rounded-md border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-500",
              fourthWallOpen
                ? "border-red-500 bg-red-900/20 text-red-300 hover:bg-red-900/30"
                : "border-red-700 text-red-400 hover:bg-red-900/20"
            )}
          >
            {overrideActive ? "Override Pending..." : "Break the Fourth Wall"}
          </button>
        </div>

        {fourthWallOpen && (
          <div
            className="mt-2 rounded-md border border-red-800 bg-red-950/20 p-4 flex flex-col gap-3"
            data-testid="fourth-wall-panel"
          >
            <p className="text-xs text-red-300 font-medium uppercase tracking-wide">
              Manager Mode — Override Next Resolution
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-400">
                Turns to summarize (lastN)
              </span>
              <input
                type="number"
                value={lastN}
                onChange={(e) => setLastN(e.target.value)}
                data-testid="fourth-wall-lastn"
                min={1}
                max={50}
                className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 w-24 focus:border-red-500 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleSummarize()}
              disabled={isLoading || !sessionId}
              data-testid="fourth-wall-summarize-button"
              className="self-start rounded-md border border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-500"
            >
              {state.status === "loading-summarize" ? "Summarizing..." : "Summarize Recent Turns"}
            </button>
            {deadlockSummary && (
              <div
                className="rounded border border-zinc-700 bg-zinc-900 p-3 text-xs text-zinc-200"
                data-testid="fourth-wall-summary-display"
              >
                <p className="text-zinc-400 uppercase tracking-wide mb-1">Summary</p>
                <p>{deadlockSummary}</p>
              </div>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-400">
                Forced outcome (replaces next dice roll)
              </span>
              <textarea
                value={forcedOutcome}
                onChange={(e) => setForcedOutcome(e.target.value)}
                data-testid="fourth-wall-forced-outcome"
                rows={3}
                placeholder="Describe exactly what happens next..."
                className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-red-500 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleForceOutcome()}
              disabled={isLoading || forcedOutcome.trim().length === 0}
              data-testid="fourth-wall-force-button"
              className="self-start rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300"
            >
              {state.status === "loading-override" ? "Forcing..." : "Force Outcome"}
            </button>
          </div>
        )}

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
          </div>
        )}

        {session && session.turns.length > 0 && (
          <div
            className="mt-2 border-t border-zinc-800 pt-3"
            data-testid="session-log"
          >
            <h3 className="text-xs uppercase tracking-wide text-zinc-300 mb-2">
              Session Log ({session.turns.length})
            </h3>
            <ol className="flex flex-col gap-2 max-h-64 overflow-auto">
              {session.turns.map((turn, i) => (
                <TurnEntry key={i} turn={turn} index={i} />
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
