"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { SessionState } from "@/lib/schemas/session";
import type { DirectorOutput } from "@/lib/orchestration/director/director";
import type { Ending } from "@/lib/schemas/session-graph";
import { NarrationFeed, type NarrationEntry } from "./narration-feed";
import { ChoicePane } from "./choice-pane";
import { CharacterSwitcher } from "./character-switcher";
import { ClockTracker } from "./clock-tracker";
import { PendingRollModal } from "./pending-roll";
import { PartySplitBanner } from "./party-split-banner";
import { EndingScreen } from "./ending-screen";
import { t } from "@/lib/i18n";

const MAX_AUTO_CONTINUES = 20;

interface PlayShellProps {
  session: SessionState;
}

export function PlayShell({ session }: PlayShellProps) {
  const router = useRouter();
  const [entries, setEntries] = useState<NarrationEntry[]>([]);
  const [output, setOutput] = useState<DirectorOutput | null>(null);
  const [activeCharacter, setActiveCharacter] = useState<string | null>(
    session.characters[0]?.name ?? null
  );
  const [worldState, setWorldState] = useState(session.worldState);
  const worldStateRef = useRef(worldState);
  useEffect(() => { worldStateRef.current = worldState; }, [worldState]);
  const [showPartySplit, setShowPartySplit] = useState(false);
  const [ended, setEnded] = useState(session.phase === "ended");
  const [endingData, setEndingData] = useState<Ending | null>(null);
  const [autoCapReached, setAutoCapReached] = useState(false);

  const graph = session.graph;
  const clocks = graph?.clocks ?? [];

  const appendEntry = useCallback(
    (text: string, move: DirectorOutput["lastMove"], speaker: "gm" | "player") => {
      // Read worldState from the ref so this callback never stales
      setEntries((prev) => [
        ...prev,
        { at: worldStateRef.current.turnCount, speaker, text, move },
      ]);
    },
    [] // stable — reads from ref, no closure over worldState
  );

  const sendDirectorInput = useCallback(
    async (input: {
      type: "start" | "continue" | "choice" | "player-input" | "skip";
      choiceIndex?: number;
      playerInput?: string;
      characterName?: string;
    }) => {
      const res = await fetch("/api/director", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, input }),
      });
      const json = await res.json();
      if (!json.ok) {
        appendEntry(`[Błąd: ${json.error}]`, "none", "gm");
        return null;
      }
      const out: DirectorOutput = json.output;
      setOutput(out);
      setWorldState(out.worldState);
      if (out.narration) {
        appendEntry(out.narration, out.lastMove, "gm");
      }
      if (out.ended) {
        setEnded(true);
      }
      return out;
    },
    [session.id, appendEntry]
  );

  // Auto-play on mount: start → continue until choices surface
  useEffect(() => {
    if (session.phase === "ended") return;

    let continueCount = 0;

    async function autoplay() {
      let out = await sendDirectorInput({ type: "start" });
      while (
        out &&
        out.phase === "narrating" &&
        !out.ended &&
        continueCount < MAX_AUTO_CONTINUES
      ) {
        continueCount++;
        out = await sendDirectorInput({ type: "continue" });
      }
      if (continueCount >= MAX_AUTO_CONTINUES) {
        setAutoCapReached(true);
      }
    }

    autoplay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleChoice(index: number) {
    await sendDirectorInput({
      type: "choice",
      choiceIndex: index,
      characterName: activeCharacter ?? undefined,
    });
  }

  async function handleFreeText(text: string) {
    appendEntry(text, "none", "player");
    await sendDirectorInput({
      type: "player-input",
      playerInput: text,
      characterName: activeCharacter ?? undefined,
    });
  }

  function handleRollResult(rollResult: number) {
    // Pass roll as player-input for now
    sendDirectorInput({
      type: "player-input",
      playerInput: `Rzut: ${rollResult}`,
      characterName: activeCharacter ?? undefined,
    });
  }

  if (ended) {
    return (
      <EndingScreen
        sessionId={session.id}
        ending={endingData}
        sessionTitle={session.brief?.tone ?? "Sesja"}
        onNewSession={() => router.push("/")}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="flex items-center gap-4 border-b border-zinc-700 bg-zinc-900 px-4 py-2">
        <h1 className="text-sm font-semibold text-amber-400">
          {session.brief?.tone ?? t("play.pageTitle")}
        </h1>
        <div className="flex-1 overflow-x-auto">
          <ClockTracker clocks={clocks} worldState={worldState} />
        </div>
      </header>

      {/* Party split banner */}
      {showPartySplit && (
        <PartySplitBanner onDismiss={() => setShowPartySplit(false)} />
      )}

      {/* Auto-cap notice */}
      {autoCapReached && (
        <div className="border-b border-zinc-700 bg-zinc-800/50 px-4 py-1.5 text-xs text-zinc-400">
          {t("play.safetyCapReached")}
        </div>
      )}

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Narration feed */}
        <main className="flex flex-1 flex-col overflow-hidden">
          <NarrationFeed entries={entries} />
          <ChoicePane
            choices={output?.choices ?? []}
            phase={output?.phase ?? "narrating"}
            onChoice={handleChoice}
            onFreeText={handleFreeText}
          />
        </main>

        {/* Right sidebar — character switcher */}
        {session.characters.length > 0 && (
          <aside className="w-48 border-l border-zinc-700 bg-zinc-900 overflow-y-auto">
            <CharacterSwitcher
              characters={session.characters}
              activeCharacter={activeCharacter}
              worldState={worldState}
              onSwitch={setActiveCharacter}
            />
          </aside>
        )}
      </div>

      {/* Pending roll modal */}
      {output?.phase === "awaiting-roll" && output.pendingRoll && (
        <PendingRollModal
          pendingRoll={output.pendingRoll}
          onRoll={handleRollResult}
        />
      )}
    </div>
  );
}
