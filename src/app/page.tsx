import { OnboardingHero } from "@/components/shell/onboarding-hero";
import { SessionList } from "@/components/sessions/session-list";
import { t } from "@/lib/i18n";

export default function HomePage() {
  return (
    <main
      className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-8 sm:py-12"
      data-testid="home-page"
    >
      <OnboardingHero />

      <div className="mx-auto h-px w-32 bg-gradient-to-r from-transparent via-amber-600/60 to-transparent" />

      <section
        className="flex flex-col gap-4"
        aria-labelledby="home-sessions-heading"
      >
        <div>
          <h2
            id="home-sessions-heading"
            className="text-xl font-semibold text-zinc-100"
          >
            {t("home.sessionsHeading")}
          </h2>
          <p className="text-sm text-zinc-400">
            {t("home.sessionsSubheading")}
          </p>
        </div>
        <SessionList />
      </section>

      <footer className="border-t border-zinc-800 pt-4 text-center text-xs text-zinc-400">
        PF1e: symulacja · PF2e: system trzech akcji
      </footer>
    </main>
  );
}
