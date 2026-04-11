import Link from "next/link";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function OnboardingHero() {
  const steps = [
    {
      n: "1",
      title: t("home.step1Title"),
      body: t("home.step1Body"),
    },
    {
      n: "2",
      title: t("home.step2Title"),
      body: t("home.step2Body"),
    },
    {
      n: "3",
      title: t("home.step3Title"),
      body: t("home.step3Body"),
    },
  ];

  return (
    <section
      className="flex flex-col gap-8 rounded-xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-8"
      aria-labelledby="onboarding-hero-heading"
      data-testid="onboarding-hero"
    >
      <div className="flex flex-col gap-3">
        <h1
          id="onboarding-hero-heading"
          className="text-3xl font-bold tracking-tight text-zinc-100 sm:text-4xl"
        >
          {t("home.heroTitle")}{" "}
          <span className="text-amber-500">— {t("home.heroSubtitle")}</span>
        </h1>
        <p className="max-w-2xl text-base text-zinc-300">{t("home.heroLead")}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/sesja/nowa" data-testid="hero-cta-new-session">
          <Button size="lg" className="w-full sm:w-auto">
            {t("home.ctaStart")}
          </Button>
        </Link>
        <Link href="/pomoc" data-testid="hero-cta-help">
          <Button size="lg" variant="ghost" className="w-full sm:w-auto">
            {t("home.ctaHelp")}
          </Button>
        </Link>
      </div>

      <div className="border-t border-zinc-800 pt-6">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-amber-500">
          {t("home.stepsHeading")}
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map((step) => (
            <li
              key={step.n}
              className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-600 bg-amber-900/20 text-sm font-bold text-amber-400">
                {step.n}
              </div>
              <h3 className="text-base font-semibold text-zinc-100">
                {step.title}
              </h3>
              <p className="text-sm text-zinc-300">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
