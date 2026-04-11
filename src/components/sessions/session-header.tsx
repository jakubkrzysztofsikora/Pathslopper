"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  useHydratedSessionBookmarks,
  useSessionBookmarks,
} from "@/lib/state/client/session-bookmarks";
import { t } from "@/lib/i18n";
import type { SessionState } from "@/lib/schemas/session";

export interface SessionHeaderProps {
  session: SessionState;
}

export function SessionHeader({ session }: SessionHeaderProps) {
  useHydratedSessionBookmarks();
  const router = useRouter();
  const bookmark = useSessionBookmarks((s) =>
    s.bookmarks.find((b) => b.id === session.id)
  );
  const touch = useSessionBookmarks((s) => s.touch);
  const rename = useSessionBookmarks((s) => s.rename);
  const remove = useSessionBookmarks((s) => s.remove);
  const add = useSessionBookmarks((s) => s.add);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [draftName, setDraftName] = React.useState(bookmark?.name ?? "");

  const versionLabel =
    session.version === "pf1e" ? "Pathfinder 1e" : "Pathfinder 2e";

  // On first mount, touch the lastOpenedAt so the session bubbles up the
  // hub list. If the server-side session exists but we have no bookmark
  // for it (e.g., the user pasted a URL), create a placeholder bookmark
  // so the hub shows it next time.
  React.useEffect(() => {
    if (bookmark) {
      touch(session.id);
      if (!draftName) setDraftName(bookmark.name);
    } else {
      add({
        id: session.id,
        name: `Sesja · ${new Date(session.createdAt).toLocaleString("pl-PL", {
          dateStyle: "short",
          timeStyle: "short",
        })}`,
        version: session.version,
        createdAt: session.createdAt,
        storyDnaSnapshot: {
          version: session.version,
          sliders: {
            narrativePacing: 50,
            tacticalLethality: 50,
            npcImprov: 50,
          },
          tags: { include: [], exclude: [] },
        },
      });
    }
    // Only on id change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  function commitRename() {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== bookmark?.name) {
      rename(session.id, trimmed);
    }
    setRenaming(false);
  }

  return (
    <Card data-testid="session-header">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setDraftName(bookmark?.name ?? "");
                  setRenaming(false);
                }
              }}
              data-testid="session-header-rename-input"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-lg font-semibold text-zinc-100 focus:border-amber-500 focus:outline-none"
            />
          ) : (
            <h1
              className="truncate text-xl font-semibold text-zinc-100"
              data-testid="session-header-title"
            >
              {bookmark?.name ?? "Sesja"}
            </h1>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone="amber">{versionLabel}</Badge>
            <Badge tone="neutral">
              {t("session.headerCharactersLabel")}: {session.characters.length}
            </Badge>
            <Badge tone="neutral" data-testid="session-header-id">
              id {session.id.slice(0, 8)}…
            </Badge>
          </div>
        </div>

        <div className="relative flex items-center gap-2">
          <Link href="/" data-testid="session-header-back">
            <Button size="sm" variant="ghost">
              {t("session.headerReturnLabel")}
            </Button>
          </Link>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            data-testid="session-header-manage"
          >
            {t("session.headerManageLabel")}
          </Button>
          {menuOpen && (
            <ul
              className="absolute right-0 top-full z-10 mt-1 flex min-w-[12rem] flex-col rounded-md border border-zinc-700 bg-zinc-900 shadow-lg"
              role="menu"
              data-testid="session-header-manage-menu"
            >
              <li>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                  onClick={() => {
                    setRenaming(true);
                    setMenuOpen(false);
                  }}
                  role="menuitem"
                  data-testid="session-header-rename"
                >
                  {t("session.headerRenameLabel")}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-zinc-800"
                  onClick={() => {
                    remove(session.id);
                    setMenuOpen(false);
                    router.push("/");
                  }}
                  role="menuitem"
                  data-testid="session-header-delete"
                >
                  {t("session.headerDeleteLabel")}
                </button>
              </li>
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
