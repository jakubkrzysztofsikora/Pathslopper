"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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

// Emotion tags like [whispers], [laughs] are for TTS only — strip from displayed text
const EMOTION_TAG_RE = /\[(?:whispers|laughs|sighs|dramatic pause|softly|angrily|fearfully|calmly|hopefully|solemnly|urgently|sadly)\]\s*/gi;

function stripEmotionTags(text: string): string {
  return text.replace(EMOTION_TAG_RE, "").trim();
}

interface TtsButtonProps {
  text: string;
  autoPlay: boolean;
}

function TtsButton({ text, autoPlay }: TtsButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const play = useCallback(async () => {
    if (state === "playing" && audioRef.current) {
      audioRef.current.pause();
      setState("idle");
      return;
    }

    // Cancel any previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState("loading");
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });

      if (!res.ok) {
        setState("error");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => setState("idle");
      audio.onerror = () => setState("error");

      setState("playing");
      await audio.play();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setState("error");
      }
    }
  }, [text, state]);

  // Auto-play on mount if enabled
  useEffect(() => {
    if (autoPlay && state === "idle") {
      play();
    }
    return () => {
      abortRef.current?.abort();
      audioRef.current?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <button
      type="button"
      onClick={play}
      className={`ml-1 shrink-0 rounded p-0.5 text-[10px] transition-colors ${
        state === "playing"
          ? "text-amber-400"
          : state === "loading"
          ? "animate-pulse text-zinc-500"
          : state === "error"
          ? "text-red-400"
          : "text-zinc-600 hover:text-zinc-400"
      }`}
      title={state === "loading" ? t("play.ttsLoading") : state === "error" ? t("play.ttsError") : ""}
    >
      {state === "playing" ? "⏸" : state === "loading" ? "◌" : "🔊"}
    </button>
  );
}

interface NarrationFeedProps {
  entries: NarrationEntry[];
  ttsEnabled?: boolean;
}

export function NarrationFeed({ entries, ttsEnabled = false }: NarrationFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    prevLengthRef.current = entries.length;
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
        {entries.map((entry, i) => {
          const isNew = i >= prevLengthRef.current;
          const isGm = entry.speaker === "gm";
          const displayText = isGm ? stripEmotionTags(entry.text) : entry.text;

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className={`flex flex-col gap-0.5 rounded-md border-l-2 px-3 py-2 ${
                isGm
                  ? `bg-zinc-800/60 ${MOVE_BORDER[entry.move]}`
                  : "ml-8 border-l-zinc-600/30 bg-zinc-900/80"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-500">
                  {isGm ? "MG" : "Gracz"}
                </span>
                {entry.move !== "none" && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${MOVE_COLOR[entry.move]} bg-zinc-800`}
                  >
                    {t(MOVE_LABEL[entry.move] as Parameters<typeof t>[0])}
                  </span>
                )}
                {isGm && (
                  <TtsButton
                    text={entry.text}
                    autoPlay={ttsEnabled && isNew}
                  />
                )}
                <span className="ml-auto text-[10px] text-zinc-600">T{entry.at}</span>
              </div>
              <p className="text-sm leading-relaxed text-zinc-200">{displayText}</p>
            </motion.div>
          );
        })}
      </AnimatePresence>
      <div ref={bottomRef} />
    </div>
  );
}
