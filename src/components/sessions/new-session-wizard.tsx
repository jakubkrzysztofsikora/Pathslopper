"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { CharacterSheetUploader } from "@/components/character-sheet/uploader";
import { StoryDNAConfig } from "@/components/story-dna/story-dna-config";
import { STORY_PRESETS, type PresetId } from "./story-presets";
import { useStoryDNAStore } from "@/lib/state/story-dna-store";
import { useSessionBookmarks } from "@/lib/state/client/session-bookmarks";
import { cn } from "@/lib/utils/cn";
import { t } from "@/lib/i18n";
import type { PathfinderVersion } from "@/lib/schemas/version";
import type { SessionState } from "@/lib/schemas/session";

type Step = 0 | 1 | 2 | 3 | 4;

const STEP_KEYS = [
  "wizard.stepVersion",
  "wizard.stepStyle",
  "wizard.stepBrief",
  "wizard.stepCharacters",
  "wizard.stepSummary",
] as const;

function formatDateShortPl(date: Date): string {
  // "11 kwi" — matches the auto-naming pattern documented in the plan.
  const months = [
    "sty",
    "lut",
    "mar",
    "kwi",
    "maj",
    "cze",
    "lip",
    "sie",
    "wrz",
    "paź",
    "lis",
    "gru",
  ];
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

function defaultSessionName(preset: PresetId): string {
  const p = STORY_PRESETS.find((x) => x.id === preset);
  // Derive the title from the preset's own i18n key so this stays in
  // lockstep with the UI copy. Previously each preset title lived in two
  // places (the dictionary + a hardcoded switch), which invited drift.
  const title = p ? t(p.titleKey) : t("wizard.pageTitle");
  return `${title} · ${formatDateShortPl(new Date())}`;
}

export function NewSessionWizard() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(0);
  const [preset, setPreset] = React.useState<PresetId>("classic");
  const [sessionName, setSessionName] = React.useState(() =>
    defaultSessionName("classic")
  );
  const [targetDurationHours, setTargetDurationHours] = React.useState(5);
  const [partySize, setPartySize] = React.useState(4);
  const [partyLevel, setPartyLevel] = React.useState(3);
  const [tone, setTone] = React.useState("");
  const [setting, setSetting] = React.useState("");
  const [characterHooks, setCharacterHooks] = React.useState<string[]>([""]);
  const [safetyLines, setSafetyLines] = React.useState<string[]>([]);
  const [safetyVeils, setSafetyVeils] = React.useState<string[]>([]);
  const [xCardEnabled, setXCardEnabled] = React.useState(true);
  const [safetyTagInput, setSafetyTagInput] = React.useState("");
  const [safetyVeilInput, setSafetyVeilInput] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const version = useStoryDNAStore((s) => s.version);
  const setVersion = useStoryDNAStore((s) => s.setVersion);
  // Avoid subscribing to the whole Story DNA store: slider tweaks elsewhere
  // (e.g., inside StoryDNAConfig during the "custom" preset branch) must
  // not rerender every step of the wizard. We read the snapshot directly
  // from `getState()` only when submitting — that's a pull, not a push.
  const addBookmark = useSessionBookmarks((s) => s.add);

  // When the user switches preset, push its DNA into the shared store so
  // the StoryDNAConfig panel (step 2b) reflects the preset the user picked.
  function applyPreset(id: PresetId, ver: PathfinderVersion) {
    setPreset(id);
    setSessionName(defaultSessionName(id));
    const entry = STORY_PRESETS.find((p) => p.id === id);
    const dna = entry?.build(ver);
    if (!dna) return; // custom preset leaves the store untouched
    useStoryDNAStore.setState({
      version: dna.version,
      sliders: dna.sliders,
      tags: dna.tags,
    });
  }

  async function handleFinish() {
    setSubmitting(true);
    setError(null);
    try {
      const liveStore = useStoryDNAStore.getState();
      const snapshot = liveStore.getSnapshot();
      const storyDna = snapshot.success
        ? snapshot.data
        : { version, sliders: liveStore.sliders, tags: liveStore.tags };
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version,
          brief: {
            version,
            partySize,
            partyLevel,
            targetDurationHours,
            tone: tone.trim(),
            setting: setting.trim(),
            presetId: preset,
            storyDna,
            characterHooks: characterHooks
              .map((h) => h.trim())
              .filter(Boolean)
              .map((h, i) => ({ characterName: `Postać ${i + 1}`, hook: h })),
            safetyTools: {
              lines: safetyLines,
              veils: safetyVeils,
              xCardEnabled,
            },
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(t("wizard.errorCreate"));
        setSubmitting(false);
        return;
      }
      const session = json.session as SessionState;
      addBookmark({
        id: session.id,
        name: sessionName.trim() || defaultSessionName(preset),
        version: session.version,
        createdAt: session.createdAt,
        storyDnaSnapshot: storyDna,
      });
      router.push(`/sesja/${session.id}`);
    } catch {
      setError(t("wizard.errorCreate"));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6" data-testid="new-session-wizard">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">
          {t("wizard.pageTitle")}
        </h1>
        <p className="text-sm text-zinc-300">{t("wizard.pageLead")}</p>
      </div>

      <ol
        className="flex flex-wrap items-center gap-1 text-xs"
        aria-label={t("wizard.stepsLabel")}
      >
        {STEP_KEYS.map((key, idx) => {
          const state =
            idx === step ? "current" : idx < step ? "done" : "pending";
          return (
            <React.Fragment key={key}>
              {idx > 0 && (
                <div
                  className={cn(
                    "hidden h-px w-6 sm:block",
                    idx <= step ? "bg-amber-600/60" : "bg-zinc-700"
                  )}
                />
              )}
              <motion.li
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1 transition-all",
                  state === "current" &&
                    "border-amber-500 bg-amber-900/20 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]",
                  state === "done" &&
                    "border-emerald-700 bg-emerald-900/10 text-emerald-400",
                  state === "pending" &&
                    "border-zinc-700 bg-zinc-900 text-zinc-400"
                )}
                data-testid={`wizard-step-indicator-${idx}`}
                data-state={state}
                animate={state === "current" ? { scale: 1.05 } : { scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
              >
                <span className="font-mono">
                  {state === "done" ? "✓" : idx + 1}
                </span>
                <span>{t(key)}</span>
              </motion.li>
            </React.Fragment>
          );
        })}
      </ol>

      <AnimatePresence mode="wait">
      {step === 0 && (
        <motion.div
          key="step-0"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.3 }}
        >
        <Card data-testid="wizard-step-0">
          <CardHeader>
            <CardTitle>{t("wizard.versionHeading")}</CardTitle>
            <CardDescription>{t("wizard.versionLead")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ToggleGroup
              value={version}
              onValueChange={(v) => setVersion(v as PathfinderVersion)}
              items={[
                {
                  value: "pf1e",
                  label: "Pathfinder 1e — symulacja fabularna",
                },
                {
                  value: "pf2e",
                  label: "Pathfinder 2e — system trzech akcji",
                },
              ]}
            />
            <div className="flex justify-end">
              <Button
                onClick={() => setStep(1)}
                data-testid="wizard-next-0"
              >
                {t("common.next")}
              </Button>
            </div>
          </CardContent>
        </Card>
        </motion.div>
      )}

      {step === 1 && (
        <motion.div
          key="step-1"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.3 }}
        >
        <Card data-testid="wizard-step-1">
          <CardHeader>
            <CardTitle>{t("wizard.styleHeading")}</CardTitle>
            <CardDescription>{t("wizard.styleLead")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {STORY_PRESETS.map((p) => {
                const active = preset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id, version)}
                    data-testid={`wizard-preset-${p.id}`}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all duration-300",
                      active
                        ? "border-amber-500 bg-amber-900/10 shadow-[0_0_16px_rgba(245,158,11,0.2)]"
                        : "border-zinc-700 bg-zinc-900 hover:border-amber-500/40 hover:shadow-[0_0_12px_rgba(245,158,11,0.1)]"
                    )}
                    aria-pressed={active}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <h3 className="text-base font-semibold text-zinc-100">
                        {t(p.titleKey)}
                      </h3>
                      {p.tagKey && <Badge tone="amber">{t(p.tagKey)}</Badge>}
                    </div>
                    <p className="text-sm text-zinc-300">{t(p.bodyKey)}</p>
                  </button>
                );
              })}
            </div>

            {preset === "custom" && <StoryDNAConfig />}

            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => setStep(0)}
                data-testid="wizard-back-1"
              >
                {t("common.previous")}
              </Button>
              <Button
                onClick={() => setStep(2)}
                data-testid="wizard-next-1"
              >
                {t("common.next")}
              </Button>
            </div>
          </CardContent>
        </Card>
        </motion.div>
      )}

      {step === 2 && (
        <motion.div
          key="step-2"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.3 }}
        >
        <Card data-testid="wizard-step-2">
          <CardHeader>
            <CardTitle>Sesja — zarys</CardTitle>
            <CardDescription>
              Opisz klimat, świat i planowany czas gry.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-400">
                  Liczba graczy
                </label>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={partySize}
                  onChange={(e) => setPartySize(Number(e.target.value))}
                  data-testid="wizard-party-size"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-400">
                  Poziom drużyny
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={partyLevel}
                  onChange={(e) => setPartyLevel(Number(e.target.value))}
                  data-testid="wizard-party-level"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-400">
                Czas trwania (godziny)
              </label>
              <input
                type="number"
                min={3}
                max={10}
                value={targetDurationHours}
                onChange={(e) =>
                  setTargetDurationHours(Number(e.target.value))
                }
                data-testid="wizard-duration"
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-400">
                Klimat (tone)
              </label>
              <input
                type="text"
                maxLength={200}
                placeholder="np. mroczny skok, epik fantasy, kosmiczny horror"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                data-testid="wizard-tone"
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-400">
                Opis świata (setting)
              </label>
              <textarea
                maxLength={500}
                rows={3}
                placeholder="Jeden akapit — gdzie jesteśmy, co się dzieje?"
                value={setting}
                onChange={(e) => setSetting(e.target.value)}
                data-testid="wizard-setting"
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
              />
            </div>
            {/* Character hooks — one text input per hook, up to 8 */}
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-400">
                Haki postaci (opcjonalnie)
              </label>
              <div className="flex flex-col gap-2">
                {characterHooks.map((hook, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      maxLength={400}
                      placeholder={`Postać ${idx + 1} — hak fabularny`}
                      value={hook}
                      onChange={(e) => {
                        const next = [...characterHooks];
                        next[idx] = e.target.value;
                        setCharacterHooks(next);
                      }}
                      data-testid={`wizard-hook-${idx}`}
                      className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                    />
                    {characterHooks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setCharacterHooks(characterHooks.filter((_, i) => i !== idx))}
                        className="rounded border border-zinc-700 px-2 text-zinc-500 hover:text-zinc-300"
                        aria-label="Usuń"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {characterHooks.length < 8 && (
                  <button
                    type="button"
                    onClick={() => setCharacterHooks([...characterHooks, ""])}
                    className="self-start rounded border border-dashed border-zinc-700 px-3 py-1 text-xs text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                  >
                    + Dodaj hak
                  </button>
                )}
              </div>
            </div>
            {/* Safety tools */}
            <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Narzędzia bezpieczeństwa
              </p>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">
                    Linie (absolutne zakazy)
                  </label>
                  <div className="flex flex-wrap gap-1 mb-1">
                    {safetyLines.map((line, i) => (
                      <span key={i} className="flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                        {line}
                        <button type="button" onClick={() => setSafetyLines(safetyLines.filter((_, j) => j !== i))} className="text-zinc-500 hover:text-zinc-200">×</button>
                      </span>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={safetyTagInput}
                    placeholder="Dodaj linię i naciśnij Enter"
                    onChange={(e) => setSafetyTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && safetyTagInput.trim()) {
                        setSafetyLines([...safetyLines, safetyTagInput.trim()]);
                        setSafetyTagInput("");
                      }
                    }}
                    data-testid="wizard-safety-lines"
                    className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">
                    Welony (tematy do zaciemnienia)
                  </label>
                  <div className="flex flex-wrap gap-1 mb-1">
                    {safetyVeils.map((veil, i) => (
                      <span key={i} className="flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                        {veil}
                        <button type="button" onClick={() => setSafetyVeils(safetyVeils.filter((_, j) => j !== i))} className="text-zinc-500 hover:text-zinc-200">×</button>
                      </span>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={safetyVeilInput}
                    placeholder="Dodaj welony i naciśnij Enter"
                    onChange={(e) => setSafetyVeilInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && safetyVeilInput.trim()) {
                        setSafetyVeils([...safetyVeils, safetyVeilInput.trim()]);
                        setSafetyVeilInput("");
                      }
                    }}
                    data-testid="wizard-safety-veils"
                    className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={xCardEnabled}
                    onChange={(e) => setXCardEnabled(e.target.checked)}
                    data-testid="wizard-x-card"
                    className="accent-amber-500"
                  />
                  Karta X włączona (domyślnie tak)
                </label>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => setStep(1)}
                data-testid="wizard-back-2"
              >
                {t("common.previous")}
              </Button>
              <Button
                onClick={() => setStep(3)}
                data-testid="wizard-next-2"
              >
                {t("common.next")}
              </Button>
            </div>
          </CardContent>
        </Card>
        </motion.div>
      )}

      {step === 3 && (
        <motion.div
          key="step-3"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.3 }}
        >
        <Card data-testid="wizard-step-3">
          <CardHeader>
            <CardTitle>{t("wizard.charactersHeading")}</CardTitle>
            <CardDescription>{t("wizard.charactersLead")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CharacterSheetUploader />
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => setStep(2)}
                data-testid="wizard-back-3"
              >
                {t("common.previous")}
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setStep(4)}
                  data-testid="wizard-skip-3"
                >
                  {t("common.skip")}
                </Button>
                <Button
                  onClick={() => setStep(4)}
                  data-testid="wizard-next-3"
                >
                  {t("common.next")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        </motion.div>
      )}

      {step === 4 && (
        <motion.div
          key="step-4"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.3 }}
        >
        <Card data-testid="wizard-step-4">
          <CardHeader>
            <CardTitle>{t("wizard.summaryHeading")}</CardTitle>
            <CardDescription>{t("wizard.summaryLead")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid gap-3 text-sm">
              <div className="flex items-baseline justify-between gap-4 border-b border-zinc-800 pb-2">
                <dt className="text-zinc-400">
                  {t("wizard.summaryVersionLabel")}
                </dt>
                <dd className="text-zinc-100">
                  {version === "pf1e" ? "Pathfinder 1e" : "Pathfinder 2e"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-zinc-800 pb-2">
                <dt className="text-zinc-400">
                  {t("wizard.summaryPresetLabel")}
                </dt>
                <dd className="text-zinc-100">
                  {(() => {
                    const p = STORY_PRESETS.find((x) => x.id === preset);
                    return p ? t(p.titleKey) : "—";
                  })()}
                </dd>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-400">
                  {t("wizard.summarySessionNameLabel")}
                </label>
                <input
                  type="text"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  data-testid="wizard-session-name"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  {t("wizard.summarySessionNameHelp")}
                </p>
              </div>
            </dl>

            {error && (
              <p className="text-sm text-red-400" role="alert">
                {error}
              </p>
            )}

            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => setStep(3)}
                data-testid="wizard-back-4"
              >
                {t("common.previous")}
              </Button>
              <Button
                size="lg"
                onClick={handleFinish}
                disabled={submitting}
                data-testid="wizard-finish"
                className={submitting ? "" : "animate-pulse-glow"}
              >
                {submitting ? t("wizard.startingCta") : t("wizard.startCta")}
              </Button>
            </div>
          </CardContent>
        </Card>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
