"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { t } from "@/lib/i18n";
import { useSessionBookmarks } from "@/lib/state/client/session-bookmarks";

export interface ExpiredSessionScreenProps {
  sessionId: string;
}

export function ExpiredSessionScreen({ sessionId }: ExpiredSessionScreenProps) {
  const remove = useSessionBookmarks((s) => s.remove);
  const markExpired = useSessionBookmarks((s) => s.markExpired);

  React.useEffect(() => {
    // Flip the bookmark to expired so the hub list reflects reality.
    markExpired(sessionId, true);
  }, [sessionId, markExpired]);

  return (
    <Card
      className="mx-auto flex max-w-xl flex-col gap-4 p-8 text-center"
      data-testid="expired-session-screen"
    >
      <CardTitle className="text-2xl">{t("session.expiredTitle")}</CardTitle>
      <CardDescription className="mx-auto max-w-md text-base leading-relaxed">
        {t("session.expiredBody")}
      </CardDescription>
      <CardContent className="flex flex-col items-center justify-center gap-3 p-0 pt-2 sm:flex-row">
        <Link href="/sesja/nowa">
          <Button size="lg" data-testid="expired-new-session">
            {t("session.expiredCreate")}
          </Button>
        </Link>
        <Button
          size="lg"
          variant="ghost"
          onClick={() => remove(sessionId)}
          data-testid="expired-forget"
        >
          {t("session.expiredForget")}
        </Button>
      </CardContent>
    </Card>
  );
}
