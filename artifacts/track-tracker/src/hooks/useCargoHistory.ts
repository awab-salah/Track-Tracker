import { useEffect, useMemo, useState } from 'react';
import type { CargoItem } from '@/data/mockData';
import { fetchDailySnapshots, fetchEarliestSnapshotDate } from '@/services/loadRepository';
import { isCargoCarriedOverToday, resolveCargoTitle } from '@/lib/cargoCarryOver';
// Re-export the pure date helpers so existing imports from
// `@/hooks/useCargoHistory` continue to work. The helpers themselves
// live in `@/lib/dateUtils` (no React, no DB, no Vite env) so they can
// be safely imported from standalone scripts too.
export {
  baghdadToday,
  addDays,
  startOfWeek,
  isoToBaghdadYmd,
  BAGHDAD_TZ,
} from '@/lib/dateUtils';

import { baghdadToday, addDays, isoToBaghdadYmd } from '@/lib/dateUtils';

export interface UseCargoHistoryResult {
  /** Today's YYYY-MM-DD in Baghdad time. Stable per mount. */
  today: string;
  /** Yesterday's YYYY-MM-DD in Baghdad time. Stable per mount. */
  yesterday: string;
  /** Currently selected day (defaults to today). */
  selectedDate: string;
  /** Setter for the selected day. */
  setSelectedDate: (ymd: string) => void;
  /**
   * Earliest navigable date (YYYY-MM-DD) — the driver's account-creation
   * date, OR the earliest snapshot date if older, OR null while loading.
   * The week selector uses this to disable the prev-week arrow when the
   * previous week would be entirely before this date.
   */
  earliestSnapshotDate: string | null;
  /**
   * Minimum navigable date (YYYY-MM-DD) for the week selector — the
   * driver's account-creation date in Baghdad local time. The user must
   * never navigate to weeks before the account-creation week. Null while
   * loading or if the driver has no `createdAt`.
   */
  minDate: string | null;
  /**
   * Maximum navigable date (YYYY-MM-DD) for the week selector — always
   * `today`. The user must never navigate to future weeks.
   */
  maxDate: string;
  /** True iff `selectedDate === today`. */
  isToday: boolean;
  /** True iff `selectedDate > today` (strictly future). */
  isFuture: boolean;
  /** True iff `selectedDate <= today` (today or past — has real cargo). */
  isLiveOrPast: boolean;
  /**
   * @deprecated Kept for backward-compat with callers that used this to
   * mean "today or future". Use `isFuture` / `isToday` instead. New code
   * should NOT use this flag — it is `true` for today, `false` for past,
   * `false` for future (because future days are NOT live — they show
   * empty cargo).
   */
  isLiveDay: boolean;
  /** Cargo rows to display, filtered to qty > 0. Empty for future days. */
  displayCargo: CargoItem[];
  /** Resolved cargo card title (midnight carry-over aware). */
  cargoTitle: string;
  /** True iff today's view is in the "carried over, not yet edited" state. */
  isCarriedOverToday: boolean;
}

/**
 * Day-based cargo/sales view + midnight carry-over detection — shared by:
 *
 *   - the Company Dashboard's Driver Details page
 *     (`src/pages/DriverDetails.tsx`)
 *   - the Driver Dashboard's Statistics tab
 *     (`src/components/driver/DriverStatsTab.tsx`)
 *
 * Responsibilities:
 *   - Track the currently-selected day (`selectedDate`).
 *   - Fetch the earliest snapshot date once per driver (gates prev-week arrow).
 *   - Fetch yesterday's snapshot once per driver (used for carry-over detect).
 *   - Fetch the selected day's snapshot for past days; clear for live/future.
 *   - Derive `displayCargo` (qty-0 filtered) from live loads or snapshot.
 *     FUTURE days always show empty cargo (per spec: future days never
 *     inherit inventory).
 *   - Derive `cargoTitle` per the spec's 4-way title matrix.
 *   - Expose `minDate` (driver account-creation date) and `maxDate` (today)
 *     so the week selector can clamp navigation to
 *     [account-creation-week .. current-week].
 *
 * The caller supplies the driver's live `cargo` (already filtered to this
 * driver via `getDriverCargo`) and the driver's `createdAt` ISO timestamp
 * (from `Driver.createdAt`). This hook does NOT mutate cargo — it only
 * reads from AppContext + the snapshot repository.
 *
 * Do NOT duplicate this logic — add new callers here.
 */
export function useCargoHistory(
  driverId: string,
  liveCargo: CargoItem[],
  driverCreatedAt?: string | null,
): UseCargoHistoryResult {
  const today = useMemo(() => baghdadToday(), []);
  const yesterday = useMemo(() => addDays(today, -1), [today]);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [earliestSnapshotDate, setEarliestSnapshotDate] = useState<string | null>(null);

  // Driver account-creation date in Baghdad-local YYYY-MM-DD. Clamps the
  // lower bound of the week selector. Null while loading or if the driver
  // row has no created_at (legacy/mock rows).
  const minDate = useMemo(
    () => isoToBaghdadYmd(driverCreatedAt ?? null),
    [driverCreatedAt],
  );

  const isToday = selectedDate === today;
  const isFuture = selectedDate > today;
  // "live or past" = today OR past day — both have real cargo to show.
  // Future days are NOT in this set (they show empty cargo per spec).
  const isLiveOrPast = !isFuture;
  // Backward-compat: callers that used `isLiveDay` to mean "today or future"
  // were broken for future days. The correct semantic going forward is:
  //   isLiveDay = isToday (only today shows editable live loads).
  // Past days show snapshots; future days show empty.
  const isLiveDay = isToday;

  const [historyCargo, setHistoryCargo] = useState<CargoItem[] | null>(null);
  // Yesterday's snapshot — fetched once per driver so today's view can
  // detect the carried-over state. Null while loading, [] if no snapshot.
  const [yesterdaySnapshot, setYesterdaySnapshot] = useState<CargoItem[] | null>(null);

  // Fetch earliest snapshot date once per driver (gates the prev-week arrow).
  useEffect(() => {
    if (!driverId) return;
    let cancelled = false;
    void fetchEarliestSnapshotDate(driverId).then((d) => {
      if (!cancelled) setEarliestSnapshotDate(d);
    });
    return () => { cancelled = true; };
  }, [driverId]);

  // Fetch yesterday's snapshot once per driver. Re-fetches when the driver
  // changes. Safe to keep cached across selectedDate changes — yesterday
  // is always relative to `today`, not selectedDate.
  useEffect(() => {
    if (!driverId) return;
    let cancelled = false;
    void fetchDailySnapshots([driverId], yesterday).then((rows) => {
      if (!cancelled) setYesterdaySnapshot(rows);
    });
    return () => { cancelled = true; };
  }, [driverId, yesterday]);

  // Fetch snapshot only for PAST days; clear when viewing today/future.
  useEffect(() => {
    if (!driverId || isFuture || isToday) {
      setHistoryCargo(null);
      return;
    }
    let cancelled = false;
    void fetchDailySnapshots([driverId], selectedDate).then((rows) => {
      if (!cancelled) setHistoryCargo(rows);
    });
    return () => { cancelled = true; };
  }, [driverId, selectedDate, isToday, isFuture]);

  // ── Cargo source derivation ──
  //
  //   PAST day   → snapshot (immutable history)
  //   TODAY      → live loads (may equal yesterday's EOD snapshot if the
  //                driver hasn't edited yet — that IS the carry-over)
  //   FUTURE day → EMPTY (per spec: future days never inherit inventory;
  //                they only become live when the calendar advances to them)
  //
  // Per spec: items whose quantity == 0 must NEVER be rendered — apply
  // this filter to ALL sources. The underlying rows in the loads table
  // and the JSONB snapshots are left untouched; this is a UI filter only.
  const displayCargo = useMemo(() => {
    if (isFuture) return [];
    const source = isToday ? liveCargo : (historyCargo ?? []);
    return source.filter((item) => item.quantity > 0);
  }, [isToday, isFuture, liveCargo, historyCargo]);

  // ── Midnight carry-over detection (spec C/D/E) ──
  const isCarriedOverToday = useMemo(
    () => isCargoCarriedOverToday(isToday, liveCargo, yesterdaySnapshot),
    [isToday, liveCargo, yesterdaySnapshot],
  );

  const cargoTitle = useMemo(
    () => resolveCargoTitle(isToday, isLiveOrPast, isCarriedOverToday),
    [isToday, isLiveOrPast, isCarriedOverToday],
  );

  return {
    today,
    yesterday,
    selectedDate,
    setSelectedDate,
    earliestSnapshotDate,
    minDate,
    maxDate: today,
    isToday,
    isFuture,
    isLiveOrPast,
    isLiveDay,
    displayCargo,
    cargoTitle,
    isCarriedOverToday,
  };
}
