"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0, 0, 0.2, 1] as const } },
};

const stepVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [0, 0, 0.2, 1] as const } },
};

export function OnboardingHero() {
  const steps = [
    { n: "1", title: t("home.step1Title"), body: t("home.step1Body") },
    { n: "2", title: t("home.step2Title"), body: t("home.step2Body") },
    { n: "3", title: t("home.step3Title"), body: t("home.step3Body") },
  ];

  return (
    <motion.section
      className="relative flex flex-col gap-8 overflow-hidden rounded-xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 p-8"
      aria-labelledby="onboarding-hero-heading"
      data-testid="onboarding-hero"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Vignette overlay */}
      <div className="pointer-events-none absolute inset-0 bg-dark-vignette" />

      <motion.div className="relative z-10 flex flex-col gap-3" variants={itemVariants}>
        <h1
          id="onboarding-hero-heading"
          className="font-display text-3xl font-bold tracking-tight sm:text-5xl"
        >
          <span className="bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-300 bg-clip-text text-transparent">
            {t("home.heroTitle")}
          </span>{" "}
          <span className="bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">
            — {t("home.heroSubtitle")}
          </span>
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-zinc-300">
          {t("home.heroLead")}
        </p>
      </motion.div>

      <motion.div className="relative z-10 flex flex-col gap-3 sm:flex-row" variants={itemVariants}>
        <Link href="/sesja/nowa" data-testid="hero-cta-new-session">
          <Button
            size="lg"
            className="w-full shadow-[0_0_12px_rgba(245,158,11,0.3)] transition-shadow hover:shadow-[0_0_24px_rgba(245,158,11,0.5)] sm:w-auto"
          >
            {t("home.ctaStart")}
          </Button>
        </Link>
        <Link href="/pomoc" data-testid="hero-cta-help">
          <Button size="lg" variant="ghost" className="w-full sm:w-auto">
            {t("home.ctaHelp")}
          </Button>
        </Link>
      </motion.div>

      <motion.div className="relative z-10 border-t border-zinc-800/60 pt-6" variants={itemVariants}>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-amber-500">
          {t("home.stepsHeading")}
        </h2>
        <motion.ol
          className="grid gap-4 sm:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {steps.map((step) => (
            <motion.li
              key={step.n}
              className="flex flex-col gap-2 rounded-lg border border-zinc-800/50 bg-zinc-900/60 p-4 backdrop-blur-sm transition-all duration-300 hover:border-zinc-700 hover:bg-zinc-800/40"
              variants={stepVariants}
              whileHover={{ scale: 1.02, y: -2 }}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-600/60 bg-amber-900/20 text-sm font-bold text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.2)]">
                {step.n}
              </div>
              <h3 className="font-display text-base font-semibold text-zinc-100">
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-zinc-300">{step.body}</p>
            </motion.li>
          ))}
        </motion.ol>
      </motion.div>
    </motion.section>
  );
}
