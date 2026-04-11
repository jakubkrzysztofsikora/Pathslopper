import { t } from "@/lib/i18n";

/**
 * Shared Polish label for a check's degree of success.
 *
 * Used by both the deterministic adjudicator (server) and the player
 * input console (client). Keeping the mapping in one place stops the
 * two copies from drifting as new labels are added.
 */
export function degreeLabelPl(degree?: string): string {
  switch (degree) {
    case "critical-success":
      return t("session.degreeCriticalSuccess");
    case "success":
      return t("session.degreeSuccess");
    case "failure":
      return t("session.degreeFailure");
    case "critical-failure":
      return t("session.degreeCriticalFailure");
    default:
      return degree ?? "";
  }
}
