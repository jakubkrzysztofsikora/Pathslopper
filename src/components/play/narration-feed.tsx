"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { DirectorOutput } from "@/lib/orchestration/director/director";
import { t } from "@/lib/i18n";

export interface NarrationEntry {
  at: number;
  speaker: "gm" | "player";
  text: string;
  move: DirectorOutput["lastMove"];
}

const MOVE_COLOR: Record<DirectorOutput["lastMove"], string> = {
  hard: "text-red-400",
  soft: "text-amber-400",
  question: "text-blue-400",
  cutscene: "text-zinc-500",
  none: "text-zinc-500",
};

const MOVE_BORDER: Record<DirectorOutput["lastMove"], string> = {
  hard: "border-l-red-500/60",
  soft: "border-l-amber-500/60",
  question: "border-l-blue-500/60",
  cutscene: "border-l-zinc-600/60",
  none: "border-l-zinc-700/40",
};

const MOVE_LABEL: Record<DirectorOutput["lastMove"], string> = {
  hard: "play.moveHard",
  soft: "play.moveSoft",
  question: "play.moveQuestion",
  cutscene: "play.moveCutscene",
  none: "play.moveNone",
} as const;

interface NarrationFeedProps {
  entries: NarrationEntry[];
}

export function NarrationFeed({ entries }: NarrationFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-600">
        {t("play.narrationEmpty")}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
      <AnimatePresence initial={false}>
        {entries.map((entry, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className={`flex flex-col gap-0.5 rounded-md border-l-2 px-3 py-2 ${
              entry.speaker === "gm"
                ? `bg-zinc-800/60 ${MOVE_BORDER[entry.move]}`
                : "ml-8 border-l-zinc-600/30 bg-zinc-900/80"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-500">
                {entry.speaker === "gm" ? "MG" : "Gracz"}
              </span>
              {entry.move !== "none" && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${MOVE_COLOR[entry.move]} bg-zinc-800`}
                >
                  {t(MOVE_LABEL[entry.move] as Parameters<typeof t>[0])}
                </span>
              )}
              <span className="ml-auto text-[10px] text-zinc-600">T{entry.at}</span>
            </div>
            <p className="text-sm leading-relaxed text-zinc-200">{entry.text}</p>
          </motion.div>
        ))}
      </AnimatePresence>
      <div ref={bottomRef} />
    </div>
  );
}
