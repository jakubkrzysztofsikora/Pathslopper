"use client";

import { motion } from "motion/react";
import { t } from "@/lib/i18n";

interface PartySplitBannerProps {
  onDismiss: () => void;
}

export function PartySplitBanner({ onDismiss }: PartySplitBannerProps) {
  return (
    <motion.div
      className="flex items-center gap-3 border-b border-amber-700/50 bg-amber-900/20 px-4 py-2.5 text-sm text-amber-300"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3 }}
    >
      <span className="animate-pulse text-amber-500">&#9888;</span>
      <span className="font-medium">{t("play.partySplitWarning")}</span>
      <button
        type="button"
        className="ml-auto text-amber-500 transition-colors hover:text-amber-300"
        onClick={onDismiss}
      >
        &#215;
      </button>
    </motion.div>
  );
}
