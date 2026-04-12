"use client";

import { t } from "@/lib/i18n";

interface PartySplitBannerProps {
  onDismiss: () => void;
}

export function PartySplitBanner({ onDismiss }: PartySplitBannerProps) {
  return (
    <div className="flex items-center gap-3 border-b border-amber-700/50 bg-amber-900/20 px-4 py-2.5 text-sm text-amber-300">
      <span className="font-medium">{t("play.partySplitWarning")}</span>
      <button
        type="button"
        className="ml-auto text-amber-500 hover:text-amber-300"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
