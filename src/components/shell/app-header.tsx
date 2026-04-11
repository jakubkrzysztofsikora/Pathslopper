import Link from "next/link";
import { t } from "@/lib/i18n";

export function AppHeader() {
  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link
          href="/"
          className="flex items-baseline gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
          data-testid="app-header-home-link"
        >
          <span className="text-lg font-bold tracking-tight text-zinc-100">
            {t("common.appName")}
          </span>
          <span className="hidden text-xs text-amber-500 sm:inline">
            {t("common.tagline")}
          </span>
        </Link>
        <nav
          className="flex items-center gap-1 text-sm"
          aria-label="Główna nawigacja"
        >
          <Link
            href="/"
            className="rounded px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            data-testid="nav-home"
          >
            {t("nav.home")}
          </Link>
          <Link
            href="/pomoc"
            className="rounded px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            data-testid="nav-help"
          >
            {t("nav.help")}
          </Link>
          <Link
            href="/sesja/nowa"
            className="ml-2 rounded-md bg-amber-600 px-3 py-1.5 font-medium text-zinc-950 hover:bg-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
            data-testid="nav-new-session"
          >
            {t("nav.newSession")}
          </Link>
        </nav>
      </div>
    </header>
  );
}
