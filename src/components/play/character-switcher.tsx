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

const AVATAR_COLORS = [
  "bg-amber-800/40 text-amber-300",
  "bg-emerald-800/40 text-emerald-300",
  "bg-blue-800/40 text-blue-300",
  "bg-purple-800/40 text-purple-300",
  "bg-red-800/40 text-red-300",
  "bg-cyan-800/40 text-cyan-300",
  "bg-pink-800/40 text-pink-300",
  "bg-orange-800/40 text-orange-300",
];

export function CharacterSwitcher({
  characters,
  activeCharacter,
  worldState,
  onSwitch,
}: CharacterSwitcherProps) {
  return (
    <div className="flex flex-col gap-2 p-3">
      <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {t("play.characterSwitcherHeading")}
      </h3>
      {characters.map((char, idx) => {
        const name = char.name ?? "Nieznana postać";
        const isActive = activeCharacter === name;
        const debt = worldState.spotlightDebt[name] ?? 0;
        const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];
        const initials = name.slice(0, 2).toUpperCase();
        return (
          <button
            key={name}
            type="button"
            onClick={() => onSwitch(name)}
            className={`flex items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition-all ${
              isActive
                ? "bg-amber-700/20 text-amber-300 ring-1 ring-amber-600 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                : "bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700/60"
            }`}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${avatarColor}`}
            >
              {initials}
            </span>
            <span className="flex-1 truncate font-medium">{name}</span>
            {debt > 0 && (
              <span
                className="shrink-0 rounded-full bg-blue-800/50 px-1.5 py-0.5 text-[9px] font-medium text-blue-300"
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
