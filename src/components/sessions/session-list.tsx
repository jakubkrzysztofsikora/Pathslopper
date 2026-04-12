"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { SessionCard } from "./session-card";
import {
  useHydratedSessionBookmarks,
  useSessionBookmarks,
} from "@/lib/state/client/session-bookmarks";
import { t } from "@/lib/i18n";

const gridVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0, 0, 0.2, 1] as const } },
};

export function SessionList() {
  const hydrated = useHydratedSessionBookmarks();
  const bookmarks = useSessionBookmarks((s) => s.bookmarks);
  const rename = useSessionBookmarks((s) => s.rename);
  const remove = useSessionBookmarks((s) => s.remove);
  const validateAll = useSessionBookmarks((s) => s.validateAll);

  React.useEffect(() => {
    if (!hydrated) return;
    if (bookmarks.length === 0) return;
    void validateAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  if (!hydrated) {
    return (
      <div
        className="h-24 rounded-lg border border-dashed border-zinc-800 bg-zinc-900/40"
        data-testid="session-list-loading"
        aria-hidden
      />
    );
  }

  if (bookmarks.length === 0) {
    return (
      <EmptyState
        data-testid="session-list-empty"
        title={t("home.sessionsEmptyTitle")}
        body={t("home.sessionsEmptyBody")}
        action={
          <Link href="/sesja/nowa">
            <Button size="md">{t("home.sessionsEmptyCta")}</Button>
          </Link>
        }
      />
    );
  }

  return (
    <motion.div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      data-testid="session-list"
      variants={gridVariants}
      initial="hidden"
      animate="visible"
    >
      {bookmarks.map((b) => (
        <motion.div key={b.id} variants={cardVariants}>
          <SessionCard
            bookmark={b}
            onRename={rename}
            onRemove={remove}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
