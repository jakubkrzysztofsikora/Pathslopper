"use client";

import { motion } from "motion/react";
import type { Ending } from "@/lib/schemas/session-graph";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

interface EndingScreenProps {
  sessionId: string;
  ending: Ending | null;
  sessionTitle: string;
  onNewSession: () => void;
}

const CATEGORY_COLOR: Record<string, string> = {
  victory: "text-emerald-400",
  mixed: "text-amber-400",
  pyrrhic: "text-orange-400",
  defeat: "text-red-400",
  tpk: "text-red-600",
  runaway: "text-zinc-400",
};

const CATEGORY_GLOW: Record<string, string> = {
  victory: "from-emerald-950/30 via-zinc-950 to-zinc-950",
  mixed: "from-amber-950/30 via-zinc-950 to-zinc-950",
  pyrrhic: "from-orange-950/30 via-zinc-950 to-zinc-950",
  defeat: "from-red-950/30 via-zinc-950 to-zinc-950",
  tpk: "from-red-950/40 via-zinc-950 to-zinc-950",
  runaway: "from-zinc-900/40 via-zinc-950 to-zinc-950",
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.4, delayChildren: 0.3 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const titleVariants = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.7, type: "spring" as const, stiffness: 200, damping: 20 } },
};

export function EndingScreen({ sessionId, ending, sessionTitle, onNewSession }: EndingScreenProps) {
  const category = ending?.category ?? "mixed";
  const titleColor = CATEGORY_COLOR[category] ?? "text-zinc-300";
  const bgGradient = CATEGORY_GLOW[category] ?? CATEGORY_GLOW.mixed;

  function handleBookmark() {
    try {
      const raw = localStorage.getItem("pfnexus:bookmarks") ?? "[]";
      const bookmarks: { id: string; name: string; endedAt: string }[] = JSON.parse(raw);
      if (!bookmarks.find((b) => b.id === sessionId)) {
        bookmarks.push({ id: sessionId, name: sessionTitle, endedAt: new Date().toISOString() });
        localStorage.setItem("pfnexus:bookmarks", JSON.stringify(bookmarks));
      }
    } catch {
      // ignore storage errors
    }
  }

  return (
    <div className={`flex min-h-screen flex-col items-center justify-center gap-8 bg-gradient-to-b ${bgGradient} px-4 text-center`}>
      {/* Vignette overlay */}
      <div className="pointer-events-none fixed inset-0 bg-dark-vignette" />

      <motion.div
        className="relative z-10 max-w-xl"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Category badge */}
        <motion.div variants={itemVariants}>
          {ending?.category && (
            <span
              className={`mb-4 inline-block rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-widest ${titleColor} border-current/20`}
            >
              {ending.category.toUpperCase()}
            </span>
          )}
        </motion.div>

        {/* Ending label */}
        <motion.p
          className="mb-2 text-xs uppercase tracking-widest text-zinc-500"
          variants={itemVariants}
        >
          {t("play.endingTitle")}
        </motion.p>

        {/* Title */}
        <motion.h1
          className={`mb-6 font-display text-4xl font-bold sm:text-5xl ${titleColor}`}
          variants={titleVariants}
        >
          {ending?.title ?? sessionTitle}
        </motion.h1>

        {/* Summary */}
        {ending?.summary && (
          <motion.p
            className="text-base leading-relaxed text-zinc-300"
            variants={itemVariants}
          >
            {ending.summary}
          </motion.p>
        )}

        {/* Front outcomes */}
        {ending?.frontOutcomes && Object.keys(ending.frontOutcomes).length > 0 && (
          <motion.div
            className="mt-6 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4 text-left"
            variants={itemVariants}
          >
            <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Wyniki wątków
            </h3>
            <ul className="space-y-1">
              {Object.entries(ending.frontOutcomes).map(([key, outcome]) => (
                <li key={key} className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300">{key}</span>
                  <span className={
                    outcome === "triumphed" ? "text-emerald-400" :
                    outcome === "neutralized" ? "text-blue-400" :
                    outcome === "delayed" ? "text-amber-400" :
                    "text-red-400"
                  }>
                    {outcome}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </motion.div>

      {/* Action buttons */}
      <motion.div
        className="relative z-10 flex gap-3"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.0, duration: 0.5 }}
      >
        <Button variant="secondary" onClick={handleBookmark}>
          {t("play.endingBookmark")}
        </Button>
        <Button variant="primary" onClick={onNewSession}>
          {t("play.endingNewSession")}
        </Button>
      </motion.div>
    </div>
  );
}
