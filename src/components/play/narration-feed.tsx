"use client";

import { useEffect, useRef } from "react";
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
      {entries.map((entry, i) => (
        <div
          key={i}
          className={`flex flex-col gap-0.5 rounded-md px-3 py-2 ${
            entry.speaker === "gm" ? "bg-zinc-800/60" : "bg-zinc-900 ml-8"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-500">
              {entry.speaker === "gm" ? "MG" : "Gracz"}
            </span>
            {entry.move !== "none" && (
              <span className={`text-[10px] ${MOVE_COLOR[entry.move]}`}>
                [{t(MOVE_LABEL[entry.move] as Parameters<typeof t>[0])}]
              </span>
            )}
            <span className="ml-auto text-[10px] text-zinc-600">T{entry.at}</span>
          </div>
          <p className="text-sm leading-relaxed text-zinc-200">{entry.text}</p>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
