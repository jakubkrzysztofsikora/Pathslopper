"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { t } from "@/lib/i18n";
import { relativeTimePl } from "@/lib/utils/relative-time-pl";
import type { SessionBookmark } from "@/lib/state/client/session-bookmarks";

export interface SessionCardProps {
  bookmark: SessionBookmark;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  className?: string;
}

export function SessionCard({
  bookmark,
  onRename,
  onRemove,
  className,
}: SessionCardProps) {
  const [editing, setEditing] = React.useState(false);
  const [draftName, setDraftName] = React.useState(bookmark.name);

  React.useEffect(() => {
    setDraftName(bookmark.name);
  }, [bookmark.name]);

  function commitRename() {
    const trimmed = draftName.trim();
    if (trimmed.length === 0) {
      setDraftName(bookmark.name);
      setEditing(false);
      return;
    }
    if (trimmed !== bookmark.name) {
      onRename(bookmark.id, trimmed);
    }
    setEditing(false);
  }

  const versionLabel =
    bookmark.version === "pf1e" ? "Pathfinder 1e" : "Pathfinder 2e";

  return (
    <Card
      className={cn(
        "flex flex-col gap-3 transition-colors hover:border-amber-700/60",
        bookmark.expired && "opacity-70",
        className
      )}
      data-testid="session-card"
      data-session-id={bookmark.id}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {editing ? (
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") {
                    setDraftName(bookmark.name);
                    setEditing(false);
                  }
                }}
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-base text-zinc-100 focus:border-amber-500 focus:outline-none"
                data-testid="session-card-rename-input"
              />
            ) : (
              <CardTitle className="truncate">{bookmark.name}</CardTitle>
            )}
            <div className="mt-2 flex items-center gap-2">
              <Badge tone="amber">{versionLabel}</Badge>
              {bookmark.expired && (
                <Badge tone="red">{t("session.expiredTitle")}</Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 pt-0">
        <p className="text-xs text-zinc-400">
          {relativeTimePl(bookmark.lastOpenedAt)}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/sesja/${bookmark.id}`}
            className="inline-flex"
            data-testid="session-card-open"
          >
            <Button size="sm" variant={bookmark.expired ? "ghost" : "primary"}>
              {bookmark.expired ? t("session.expiredCreate") : t("common.next")}
            </Button>
          </Link>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing((v) => !v)}
            data-testid="session-card-rename"
          >
            {t("common.rename")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onRemove(bookmark.id)}
            data-testid="session-card-remove"
          >
            {t("common.delete")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
