"use client";

import { useState } from "react";
import type { DirectorOutput } from "@/lib/orchestration/director/director";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

interface ChoicePaneProps {
  choices: DirectorOutput["choices"];
  phase: DirectorOutput["phase"];
  onChoice: (index: number) => Promise<void>;
  onFreeText: (text: string) => Promise<void>;
}

export function ChoicePane({ choices, phase, onChoice, onFreeText }: ChoicePaneProps) {
  const [freeText, setFreeText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleChoice(index: number) {
    setSubmitting(true);
    try { await onChoice(index); } finally { setSubmitting(false); }
  }

  async function handleFreeTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!freeText.trim()) return;
    setSubmitting(true);
    try {
      await onFreeText(freeText.trim());
      setFreeText("");
    } finally {
      setSubmitting(false);
    }
  }

  const isAwaiting = phase === "awaiting-choice";

  return (
    <div className="flex flex-col gap-3 border-t border-zinc-700 bg-zinc-900/80 px-4 py-4">
      {choices.length > 0 && (
        <div className="flex flex-col gap-2">
          {choices.map((choice) => (
            <Button
              key={choice.index}
              variant="secondary"
              size="sm"
              className="w-full justify-start text-left"
              disabled={submitting || !isAwaiting}
              onClick={() => handleChoice(choice.index)}
            >
              {choice.label}
            </Button>
          ))}
        </div>
      )}

      {/* Free-text input — always available as escape hatch */}
      <form onSubmit={handleFreeTextSubmit} className="flex flex-col gap-2">
        <textarea
          className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none resize-none"
          rows={2}
          placeholder={t("play.freeTextPlaceholder")}
          value={freeText}
          disabled={submitting}
          onChange={(e) => setFreeText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleFreeTextSubmit(e as unknown as React.FormEvent);
            }
          }}
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={submitting || !freeText.trim()}
        >
          {submitting ? t("play.choiceSubmitting") : t("play.choiceSubmit")}
        </Button>
      </form>
    </div>
  );
}
