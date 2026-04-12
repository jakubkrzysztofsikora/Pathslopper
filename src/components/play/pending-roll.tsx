"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { DirectorOutput } from "@/lib/orchestration/director/director";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

interface PendingRollProps {
  pendingRoll: NonNullable<DirectorOutput["pendingRoll"]>;
  onRoll: (result: number) => void;
}

export function PendingRollModal({ pendingRoll, onRoll }: PendingRollProps) {
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState<number | null>(null);

  function handleRoll() {
    setRolling(true);
    const roll = Math.floor(Math.random() * 20) + 1;
    setTimeout(() => {
      setResult(roll);
      setRolling(false);
      setTimeout(() => onRoll(roll), 600);
    }, 500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/85 backdrop-blur-sm">
      <motion.div
        className="w-80 rounded-xl border border-zinc-700/60 bg-gradient-to-b from-zinc-900 to-zinc-950 p-6 shadow-2xl"
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
      >
        <h2 className="mb-4 font-display text-base font-semibold text-amber-400">
          {t("play.pendingRollHeading")}
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500">{t("play.pendingRollCharacter")}:</span>
            <span className="font-medium text-zinc-200">{pendingRoll.characterName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">{t("play.pendingRollSkill")}:</span>
            <span className="font-medium text-zinc-200">{pendingRoll.skillOrAttack}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">{t("play.pendingRollDc")}:</span>
            <span className="text-lg font-bold text-amber-400 shadow-amber-500/20">{pendingRoll.dc}</span>
          </div>
        </div>

        {/* Dice result display */}
        <AnimatePresence>
          {result !== null && (
            <motion.div
              className="mt-4 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
            >
              <span className="font-display text-4xl font-bold text-amber-400 drop-shadow-lg">
                {result}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          className="mt-6 w-full"
          variant="primary"
          size="lg"
          onClick={handleRoll}
          disabled={rolling || result !== null}
        >
          {rolling ? (
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 0.5, repeat: Infinity, ease: "linear" }}
              className="inline-block"
            >
              d20
            </motion.span>
          ) : result !== null ? (
            `Wynik: ${result}`
          ) : (
            t("play.pendingRollRoll")
          )}
        </Button>
      </motion.div>
    </div>
  );
}
