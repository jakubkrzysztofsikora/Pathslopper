"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";

interface GenerationTriggerProps {
  sessionId: string;
}

const STAGE_LABELS = [
  "Szkielet sesji",
  "Sceny i węzły",
  "Świat i lokacje",
  "Połączenia i krawędzie",
  "Narracja i monity",
  "Stat bloki NPC",
];

export function GenerationTrigger({ sessionId }: GenerationTriggerProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "generating" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval>;

    async function generate() {
      setStatus("generating");
      const start = Date.now();
      timer = setInterval(() => {
        setElapsed(Math.floor((Date.now() - start) / 1000));
      }, 1000);

      try {
        const res = await fetch(`/api/sessions/${sessionId}/generate`, {
          method: "POST",
        });
        const json = await res.json();

        if (cancelled) return;

        if (json.ok) {
          // Generation succeeded — reload to see authoring phase
          router.refresh();
        } else {
          setStatus("error");
          setErrorMsg(json.error ?? "Nieznany błąd generowania");
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg("Błąd połączenia z serwerem");
      } finally {
        clearInterval(timer);
      }
    }

    generate();

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sessionId, router]);

  if (status === "error") {
    return (
      <section className="rounded-lg border border-red-800/60 bg-red-950/20 p-6">
        <p className="font-medium text-red-400">Błąd generowania grafu sesji</p>
        <p className="mt-1 text-sm text-zinc-400">{errorMsg}</p>
        <button
          type="button"
          className="mt-3 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-500"
          onClick={() => {
            setStatus("idle");
            setErrorMsg(null);
            setElapsed(0);
            // Re-trigger by remounting — set idle then useEffect won't fire,
            // so we call generate inline
            window.location.reload();
          }}
        >
          Spróbuj ponownie
        </button>
      </section>
    );
  }

  // Estimate stage based on elapsed time (rough: ~10-15s per stage)
  const stageIndex = Math.min(Math.floor(elapsed / 12), STAGE_LABELS.length - 1);

  return (
    <section className="rounded-lg border border-zinc-700 bg-zinc-900 p-6">
      <div className="flex flex-col gap-4">
        <div>
          <p className="font-medium text-zinc-200">Generowanie grafu sesji...</p>
          <p className="mt-1 text-sm text-zinc-400">
            6-etapowy pipeline LLM — to może potrwać do 90 sekund.
          </p>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-2">
          {STAGE_LABELS.map((label, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${
                i <= stageIndex ? "bg-amber-500" : "bg-zinc-700"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>{STAGE_LABELS[stageIndex]}</span>
          <span>{elapsed}s</span>
        </div>

        {/* Pulsing indicator */}
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          Trwa przetwarzanie...
        </div>
      </div>
    </section>
  );
}
