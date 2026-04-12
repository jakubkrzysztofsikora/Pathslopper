"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
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
    <div className="flex flex-col gap-3 border-t border-zinc-700/60 bg-zinc-900/80 px-4 py-4">
      <AnimatePresence>
        {choices.length > 0 && (
          <motion.div
            className="flex flex-col gap-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
          >
            {choices.map((choice, i) => (
              <motion.div
                key={choice.index}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08, duration: 0.3 }}
              >
                <button
                  type="button"
                  className={`w-full rounded-md border border-zinc-700 bg-zinc-800/80 px-4 py-3 text-left text-sm text-zinc-200 transition-all duration-200 ${
                    isAwaiting && !submitting
                      ? "hover:border-amber-500/50 hover:bg-zinc-800 hover:shadow-[0_0_12px_rgba(245,158,11,0.15)] hover:text-zinc-100"
                      : "opacity-60 cursor-not-allowed"
                  }`}
                  disabled={submitting || !isAwaiting}
                  onClick={() => handleChoice(choice.index)}
                >
                  <span className="mr-2 text-xs text-amber-500/60">{choice.index + 1}.</span>
                  {choice.label}
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Free-text input */}
      <form onSubmit={handleFreeTextSubmit} className="flex flex-col gap-2">
        <textarea
          className="w-full rounded-md border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 transition-colors focus:border-amber-500/60 focus:outline-none focus:shadow-[0_0_8px_rgba(245,158,11,0.1)] resize-none"
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
