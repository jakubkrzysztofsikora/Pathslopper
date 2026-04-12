"use client";

import type { CharacterSheetParsed } from "@/lib/schemas/character-sheet";
import type { WorldState } from "@/lib/schemas/session";
import { t } from "@/lib/i18n";

interface CharacterSwitcherProps {
  characters: CharacterSheetParsed[];
  activeCharacter: string | null;
  worldState: WorldState;
  onSwitch: (name: string) => void;
}

export function CharacterSwitcher({
  characters,
  activeCharacter,
  worldState,
  onSwitch,
}: CharacterSwitcherProps) {
  return (
    <div className="flex flex-col gap-2 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {t("play.characterSwitcherHeading")}
      </h3>
      {characters.map((char) => {
        const name = char.name ?? "Nieznana postać";
        const isActive = activeCharacter === name;
        const debt = worldState.spotlightDebt[name] ?? 0;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onSwitch(name)}
            className={`flex items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors ${
              isActive
                ? "bg-amber-700/30 text-amber-300 ring-1 ring-amber-600"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            <span className="truncate font-medium">{name}</span>
            {debt > 0 && (
              <span
                className="ml-2 shrink-0 rounded-full bg-blue-800/50 px-1.5 py-0.5 text-[9px] text-blue-300"
                title={t("play.spotlightDebtLabel")}
              >
                {debt}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
