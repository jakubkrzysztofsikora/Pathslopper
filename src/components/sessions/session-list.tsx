"use client";

import * as React from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { SessionCard } from "./session-card";
import {
  useHydratedSessionBookmarks,
  useSessionBookmarks,
} from "@/lib/state/client/session-bookmarks";
import { t } from "@/lib/i18n";

/**
 * Hub session list. Reads bookmarks from the client store, pings each one
 * against `GET /api/sessions/[id]` once on mount to flag expired entries,
 * and renders a grid of `SessionCard`s. Handles three states: pre-hydrate
 * (null, avoid flash), empty, and populated.
 */
export function SessionList() {
  const hydrated = useHydratedSessionBookmarks();
  const bookmarks = useSessionBookmarks((s) => s.bookmarks);
  const rename = useSessionBookmarks((s) => s.rename);
  const remove = useSessionBookmarks((s) => s.remove);
  const validateAll = useSessionBookmarks((s) => s.validateAll);

  React.useEffect(() => {
    if (!hydrated) return;
    if (bookmarks.length === 0) return;
    // Kick a best-effort refresh once per mount. Failures are swallowed
    // inside the store — network flake must not blank the list.
    void validateAll();
    // Only on first hydration — subsequent adds/removes don't need a
    // full re-check because they mutate the local index directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  if (!hydrated) {
    // Avoid flashing the empty state during the first client render.
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
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      data-testid="session-list"
    >
      {bookmarks.map((b) => (
        <SessionCard
          key={b.id}
          bookmark={b}
          onRename={rename}
          onRemove={remove}
        />
      ))}
    </div>
  );
}
