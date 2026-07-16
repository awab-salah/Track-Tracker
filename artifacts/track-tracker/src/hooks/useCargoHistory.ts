import { useEffect, useMemo, useState } from 'react';
import type { CargoItem } from '@/data/mockData';
import { fetchDailySnapshots, fetchEarliestSnapshotDate } from '@/services/loadRepository';
import { isCargoCarriedOverToday, resolveCargoTitle } from '@/lib/cargoCarryOver';

/**
 * Baghdad timezone — UTC+3, no DST. Used only for "today" computation.
 * Date arithmetic on YYYY-MM-DD strings is done in UTC to stay
 * timezone-safe regardless of the browser's local timezone.
 */
const BAGHDAD_TZ = 'Asia/Baghdad';

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

export interface UseCargoHistoryResult {
  /** Today's YYYY-MM-DD in Baghdad time. Stable per mount. */
  today: string;
  /** Yesterday's YYYY-MM-DD in Baghdad time. Stable per mount. */
  yesterday: string;
  /** Currently selected day (defaults to today). */
  selectedDate: string;
  /** Setter for the selected day. */
  setSelectedDate: (ymd: string) => void;
  /** Earliest snapshot date (YYYY-MM-DD) — gates the prev-week arrow. */
  earliestSnapshotDate: string | null;
  /** True iff `selectedDate === today`. */
  isToday: boolean;
  /** True iff `selectedDate >= today` (today or future → live loads). */
  isLiveDay: boolean;
  /** Cargo rows to display, filtered to qty > 0. */
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
 *   - Fetch the selected day's snapshot for past days; clear for live days.
 *   - Derive `displayCargo` (qty-0 filtered) from live loads or snapshot.
 *   - Derive `cargoTitle` per the spec's 4-way title matrix.
 *
 * The caller supplies the driver's live `cargo` (already filtered to this
 * driver via `getDriverCargo`). This hook does NOT mutate cargo — it only
 * reads from AppContext + the snapshot repository.
 *
 * Do NOT duplicate this logic — add new callers here.
 */
export function useCargoHistory(
  driverId: string,
  liveCargo: CargoItem[],
): UseCargoHistoryResult {
  const today = useMemo(() => baghdadToday(), []);
  const yesterday = useMemo(() => addDays(today, -1), [today]);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [earliestSnapshotDate, setEarliestSnapshotDate] = useState<string | null>(null);

  const isToday = selectedDate === today;
  // "live" = today OR future: live loads table, editable, empty for future.
  const isLiveDay = selectedDate >= today;

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

  // Fetch snapshot only for past days; clear when viewing today/future.
  useEffect(() => {
    if (!driverId || isLiveDay) {
      setHistoryCargo(null);
      return;
    }
    let cancelled = false;
    void fetchDailySnapshots([driverId], selectedDate).then((rows) => {
      if (!cancelled) setHistoryCargo(rows);
    });
    return () => { cancelled = true; };
  }, [driverId, selectedDate, isLiveDay]);

  // Cargo source: live loads for today/future; snapshot for past days.
  // Per spec: items whose quantity == 0 must NEVER be rendered — apply
  // this to BOTH live and snapshot cargo. The underlying rows in the
  // loads table and the JSONB snapshots are left untouched; this is a
  // UI filter only.
  const displayCargo = useMemo(() => {
    const source = isLiveDay ? liveCargo : (historyCargo ?? []);
    return source.filter((item) => item.quantity > 0);
  }, [isLiveDay, liveCargo, historyCargo]);

  // ── Midnight carry-over detection (spec C/D/E) ──
  const isCarriedOverToday = useMemo(
    () => isCargoCarriedOverToday(isToday, liveCargo, yesterdaySnapshot),
    [isToday, liveCargo, yesterdaySnapshot],
  );

  const cargoTitle = useMemo(
    () => resolveCargoTitle(isToday, isLiveDay, isCarriedOverToday),
    [isToday, isLiveDay, isCarriedOverToday],
  );

  return {
    today,
    yesterday,
    selectedDate,
    setSelectedDate,
    earliestSnapshotDate,
    isToday,
    isLiveDay,
    displayCargo,
    cargoTitle,
    isCarriedOverToday,
  };
}
