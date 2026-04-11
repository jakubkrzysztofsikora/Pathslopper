"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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

type Step = 0 | 1 | 2 | 3;

const STEP_KEYS = [
  "wizard.stepVersion",
  "wizard.stepStyle",
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
  const title =
    p?.id === "custom"
      ? "Sesja własna"
      : (() => {
          // These are stable runtime lookups — the titleKey is a literal.
          // We inline a tiny switch rather than reach into i18n for
          // "keys as values" dynamics.
          switch (p?.id) {
            case "classic":
              return "Klasyczna wyprawa";
            case "intrigue":
              return "Polityczna intryga";
            case "horror":
              return "Mroczny horror";
            default:
              return "Sesja";
          }
        })();
  return `${title} · ${formatDateShortPl(new Date())}`;
}

export function NewSessionWizard() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(0);
  const [preset, setPreset] = React.useState<PresetId>("classic");
  const [sessionName, setSessionName] = React.useState(() =>
    defaultSessionName("classic")
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const version = useStoryDNAStore((s) => s.version);
  const setVersion = useStoryDNAStore((s) => s.setVersion);
  const storyStore = useStoryDNAStore();
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
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(t("wizard.errorCreate"));
        setSubmitting(false);
        return;
      }
      const session = json.session as SessionState;
      const snapshot = storyStore.getSnapshot();
      addBookmark({
        id: session.id,
        name: sessionName.trim() || defaultSessionName(preset),
        version: session.version,
        createdAt: session.createdAt,
        storyDnaSnapshot: snapshot.success
          ? snapshot.data
          : {
              version,
              sliders: storyStore.sliders,
              tags: storyStore.tags,
            },
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
        className="flex flex-wrap items-center gap-2 text-xs"
        aria-label="Kroki kreatora"
      >
        {STEP_KEYS.map((key, idx) => {
          const state =
            idx === step ? "current" : idx < step ? "done" : "pending";
          return (
            <li
              key={key}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1",
                state === "current" &&
                  "border-amber-500 bg-amber-900/20 text-amber-300",
                state === "done" &&
                  "border-emerald-700 bg-emerald-900/10 text-emerald-400",
                state === "pending" &&
                  "border-zinc-700 bg-zinc-900 text-zinc-400"
              )}
              data-testid={`wizard-step-indicator-${idx}`}
              data-state={state}
            >
              <span className="font-mono">{idx + 1}</span>
              <span>{t(key)}</span>
            </li>
          );
        })}
      </ol>

      {step === 0 && (
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
      )}

      {step === 1 && (
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
                      "flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors",
                      active
                        ? "border-amber-500 bg-amber-900/10"
                        : "border-zinc-700 bg-zinc-900 hover:border-zinc-500"
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
      )}

      {step === 2 && (
        <Card data-testid="wizard-step-2">
          <CardHeader>
            <CardTitle>{t("wizard.charactersHeading")}</CardTitle>
            <CardDescription>{t("wizard.charactersLead")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CharacterSheetUploader />
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => setStep(1)}
                data-testid="wizard-back-2"
              >
                {t("common.previous")}
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setStep(3)}
                  data-testid="wizard-skip-2"
                >
                  {t("common.skip")}
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  data-testid="wizard-next-2"
                >
                  {t("common.next")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card data-testid="wizard-step-3">
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
                onClick={() => setStep(2)}
                data-testid="wizard-back-3"
              >
                {t("common.previous")}
              </Button>
              <Button
                size="lg"
                onClick={handleFinish}
                disabled={submitting}
                data-testid="wizard-finish"
              >
                {submitting ? t("wizard.startingCta") : t("wizard.startCta")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
