/**
 * Tiny single-locale i18n helper.
 *
 * We intentionally do NOT use `next-intl` for the MVP. A single Polish
 * dictionary file plus a dot-path lookup is the simplest thing that works —
 * the bundle cost of `next-intl` isn't justified while we target a single
 * locale. If we add a second locale later, swap this module for
 * `next-intl`'s server helpers — the `t("namespace.key")` signature is
 * compatible.
 *
 * Usage:
 *
 *   import { t } from "@/lib/i18n";
 *   t("home.ctaStart");               // "Nowa sesja"
 *   t("session.expiredBody");         // "Sesje Pathfinder Nexus żyją…"
 *
 * Interpolation is handled by the caller via `format(t("key"), { name })`:
 *
 *   format(t("storyDna.lead"), { versionLabel: "Pathfinder 2e" });
 */

import { pl } from "./pl";

export { pl };

// Recursive dot-path type — resolves nested keys like "home.ctaStart".
type DotPaths<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : T[K] extends object
    ? DotPaths<T[K], `${Prefix}${K}.`>
    : never;
}[keyof T & string];

export type TranslationKey = DotPaths<typeof pl>;

/**
 * Resolve a dot-path key to its Polish string. The TS type above guarantees
 * at compile time that only valid keys reach this function, so a runtime
 * miss is genuinely unexpected and we throw. This gives loud feedback the
 * next time anyone forgets to add a key.
 */
export function t(key: TranslationKey): string {
  const segments = key.split(".");
  let node: unknown = pl;
  for (const seg of segments) {
    if (node && typeof node === "object" && seg in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[seg];
    } else {
      throw new Error(`[i18n] Missing translation key: ${key}`);
    }
  }
  if (typeof node !== "string") {
    throw new Error(`[i18n] Key "${key}" resolves to a namespace, not a string.`);
  }
  return node;
}

/**
 * Replace `{name}` placeholders in a translated string. Accepts any
 * JSON-serializable scalar and coerces it to a string. Unknown placeholders
 * are left as-is (helpful in dev — you notice the `{foo}` marker in the UI).
 */
export function format(
  template: string,
  values: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name)
      ? String(values[name])
      : match
  );
}
