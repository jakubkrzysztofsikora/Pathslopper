"use client";

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

export function EndingScreen({ sessionId, ending, sessionTitle, onNewSession }: EndingScreenProps) {
  const titleColor = ending ? (CATEGORY_COLOR[ending.category] ?? "text-zinc-300") : "text-zinc-300";

  function handleBookmark() {
    // Persist session bookmark via localStorage (matches existing session-bookmarks store)
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
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-zinc-950 px-4 text-center">
      <div className="max-w-xl">
        <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">
          {t("play.endingTitle")}
        </p>
        <h1 className={`mb-4 text-3xl font-bold ${titleColor}`}>
          {ending?.title ?? sessionTitle}
        </h1>
        {ending?.summary && (
          <p className="text-base leading-relaxed text-zinc-300">{ending.summary}</p>
        )}

        {ending?.category && (
          <span
            className={`mt-4 inline-block rounded-full border px-3 py-1 text-xs font-medium ${titleColor} border-current/30`}
          >
            {ending.category.toUpperCase()}
          </span>
        )}
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={handleBookmark}>
          {t("play.endingBookmark")}
        </Button>
        <Button variant="primary" onClick={onNewSession}>
          {t("play.endingNewSession")}
        </Button>
      </div>
    </div>
  );
}
