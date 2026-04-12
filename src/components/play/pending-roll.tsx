"use client";

import { useState } from "react";
import type { DirectorOutput } from "@/lib/orchestration/director/director";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

interface PendingRollProps {
  pendingRoll: NonNullable<DirectorOutput["pendingRoll"]>;
  onRoll: (result: number) => void;
}

export function PendingRollModal({ pendingRoll, onRoll }: PendingRollProps) {
  const [rolling, setRolling] = useState(false);

  function handleRoll() {
    setRolling(true);
    const roll = Math.floor(Math.random() * 20) + 1;
    setTimeout(() => {
      setRolling(false);
      onRoll(roll);
    }, 400);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
      <div className="w-80 rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
        <h2 className="mb-4 text-base font-semibold text-amber-400">
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
            <span className="font-medium text-amber-400">{pendingRoll.dc}</span>
          </div>
        </div>
        <Button
          className="mt-6 w-full"
          variant="primary"
          onClick={handleRoll}
          disabled={rolling}
        >
          {rolling ? "Rzucam…" : t("play.pendingRollRoll")}
        </Button>
      </div>
    </div>
  );
}
