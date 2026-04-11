/**
 * Minimal Polish relative-time formatter.
 *
 * We don't pull in Intl.RelativeTimeFormat because the grammatical forms
 * matter for Polish (1 godzinę, 2 godziny, 5 godzin) and the native API
 * still returns "2 godz." / "1 godz." on Node 18 — technically correct
 * but terse and inconsistent with the rest of the UI copy. This bespoke
 * formatter uses the full declension for small numbers, which matches
 * how players actually speak.
 */

function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  if (abs === 1) return one;
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/**
 * Formats "how long ago" for a past timestamp. Returns strings like:
 *   - "przed chwilą"
 *   - "2 minuty temu"
 *   - "5 godzin temu"
 *   - "3 dni temu"
 */
export function relativeTimePl(fromIso: string, now: Date = new Date()): string {
  const then = new Date(fromIso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = now.getTime() - then;
  if (diffMs < 0) return "za chwilę";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return "przed chwilą";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} ${plural(min, "minutę", "minuty", "minut")} temu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${plural(hr, "godzinę", "godziny", "godzin")} temu`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} ${plural(day, "dzień", "dni", "dni")} temu`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon} ${plural(mon, "miesiąc", "miesiące", "miesięcy")} temu`;
  const year = Math.floor(day / 365);
  return `${year} ${plural(year, "rok", "lata", "lat")} temu`;
}
