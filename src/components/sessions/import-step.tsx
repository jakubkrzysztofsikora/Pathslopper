"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const MAX_CHARS = 50_000;

type Phase = "idle" | "submitting" | "error" | "done-with-warnings";

interface ImportResponse {
  ok: boolean;
  graph?: unknown;
  warnings?: string[];
  pendingConsent?: { clocks: boolean; fronts: boolean; endings: boolean };
  repairs?: string[];
  error?: string;
  stage?: string;
}

const WARNING_LABELS: Record<string, string> = {
  "looks-like-recap": "Wygląda to bardziej na rekap niż na plan sesji — sprawdź, czy import się przydał.",
  "paizo-ip": "Wykryto terminy z własności intelektualnej Paizo. Import pozostaje prywatny — ale nie publikuj grafu publicznie.",
};

/**
 * Standalone import flow. Creates a new session + runs the import pipeline
 * + redirects the GM into the authoring UI so they can review synthesised
 * fields before approval.
 */
export function ImportStep() {
  const router = useRouter();
  const [raw, setRaw] = React.useState("");
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [pendingConsent, setPendingConsent] = React.useState<ImportResponse["pendingConsent"] | null>(null);

  const overLimit = raw.length > MAX_CHARS;
  const canSubmit = raw.trim().length > 0 && !overLimit && phase !== "submitting";

  async function handleSubmit() {
    setPhase("submitting");
    setError(null);
    setWarnings([]);
    setPendingConsent(null);

    // 1. Create the session shell.
    let sessionId: string;
    try {
      const createRes = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: "pf2e" }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok || !createJson.ok) {
        setError(createJson.error ?? "Nie udało się utworzyć sesji.");
        setPhase("error");
        return;
      }
      sessionId = createJson.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd sieci przy tworzeniu sesji.");
      setPhase("error");
      return;
    }

    // 2. Import content.
    let importJson: ImportResponse;
    try {
      const importRes = await fetch(`/api/sessions/${sessionId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: raw }),
      });
      importJson = (await importRes.json()) as ImportResponse;
      if (!importRes.ok || !importJson.ok) {
        setError(importJson.error ?? "Import nie powiódł się.");
        setPhase("error");
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd sieci przy imporcie.");
      setPhase("error");
      return;
    }

    // 3. If there are warnings or pending consent flags, surface them;
    //    the GM can review and click through to authoring. For MVP we
    //    don't re-run import with explicit consent — the orchestrator
    //    already synthesised defaults and flagged them in provenance, so
    //    the GM reviews them in the editor.
    if (
      (importJson.warnings && importJson.warnings.length > 0) ||
      (importJson.pendingConsent && Object.values(importJson.pendingConsent).some(Boolean))
    ) {
      setWarnings(importJson.warnings ?? []);
      setPendingConsent(importJson.pendingConsent ?? null);
      setPhase("done-with-warnings");
      // auto-redirect after a short delay so the user can see the warning
      setTimeout(() => router.push(`/sesja/${sessionId}/przygotowanie`), 800);
      return;
    }

    router.push(`/sesja/${sessionId}/przygotowanie`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Importuj istniejące notatki</CardTitle>
        <CardDescription>
          Wklej swoje notatki sesji w Markdownie (Obsidian, gist, szablon Sly Flourish,
          eksport Notion). Tytuły sekcji jak {`"## Sceny"`} / {`"## Scenes"`}, {`"## Sekrety"`} /
          {` "## Secrets and Clues"`}, {`"## BNi"`} / {`"## NPCs"`} itd. są automatycznie rozpoznawane.
          Brakujące fragmenty (zegary, fronty, zakończenia) zostaną uzupełnione i
          oznaczone jako wymysłone przez AI — sprawdź je w edytorze przed zatwierdzeniem.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <textarea
          aria-label="Notatki sesji"
          className="min-h-[320px] w-full resize-y rounded-md border border-zinc-700 bg-zinc-900 p-3 font-mono text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={`---\nsystem: pf2e\nparty_level: 3\nparty_size: 4\n---\n\n# Tytuł sesji\n\n## Strong Start\n...\n\n## Scenes\n- Pierwsza scena — opis\n- Druga scena — opis\n\n## NPCs\n- Imię — rola, głos\n\n## Secrets and Clues\n- pierwsza wskazówka\n- druga wskazówka\n`}
          disabled={phase === "submitting"}
        />
        <div className="flex items-center justify-between text-xs">
          <span className={overLimit ? "text-red-400" : "text-zinc-500"}>
            {raw.length.toLocaleString("pl-PL").replace(/\u00a0/g, " ")} / 50 000
          </span>
          {phase === "submitting" && (
            <span className="text-amber-400">Parsowanie… 15-60s</span>
          )}
        </div>

        {error && (
          <div role="alert" className="rounded border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">
            Błąd: {error}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">
            <p className="mb-1 font-semibold">Uwagi:</p>
            <ul className="list-inside list-disc">
              {warnings.map((w) => (
                <li key={w}>{WARNING_LABELS[w] ?? w}</li>
              ))}
            </ul>
          </div>
        )}

        {pendingConsent && Object.values(pendingConsent).some(Boolean) && (
          <div className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">
            Brakujące sekcje zostały wygenerowane i oznaczone jako AI — sprawdź je w edytorze:
            {" "}
            {pendingConsent.clocks && "zegary "}
            {pendingConsent.fronts && "fronty "}
            {pendingConsent.endings && "zakończenia"}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {phase === "submitting" ? "Importuję…" : "Importuj"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
