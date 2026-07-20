/**
 * Pure date helpers — no React, no DB, no Vite env. Safe to import from
 * anywhere (including standalone scripts that bypass Vite's env injection).
 *
 * All date math is done in UTC on YYYY-MM-DD strings to stay timezone-safe
 * regardless of the browser's local timezone. Baghdad timezone (UTC+3, no
 * DST) is used only for "today" / ISO→YMD conversions.
 *
 * These helpers are re-exported from `src/hooks/useCargoHistory.ts` for
 * historical reasons — existing imports from there continue to work. New
 * code should import directly from this file.
 */

/** Baghdad timezone — UTC+3, no DST. */
export const BAGHDAD_TZ = 'Asia/Baghdad';

/** Returns YYYY-MM-DD for today in Baghdad local time. */
export function baghdadToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BAGHDAD_TZ });
}

/**
 * Add `offset` days to a YYYY-MM-DD string, returning a new YYYY-MM-DD.
 * Arithmetic is done in UTC to avoid local-timezone drift.
 */
export function addDays(ymd: string, offset: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + offset);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Returns YYYY-MM-DD for the Sunday starting the week containing `ymd`. */
export function startOfWeek(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = date.getUTCDay(); // 0 = Sun, 6 = Sat
  return addDays(ymd, -dayOfWeek);
}

/**
 * Convert an ISO timestamp (e.g. `2026-06-15T08:00:00.000Z`) to a
 * YYYY-MM-DD Baghdad-local date string.
 *
 * Returns null if the input is missing or invalid.
 */
export function isoToBaghdadYmd(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-CA', { timeZone: BAGHDAD_TZ });
}
