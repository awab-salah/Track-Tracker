import type { CargoItem } from '@/data/mockData';

/**
 * Midnight carry-over detection (spec C/D/E).
 *
 * Pure helpers — no React, no DB. Used by BOTH:
 *   - the Company Dashboard's Driver Details page
 *     (`src/pages/DriverDetails.tsx`)
 *   - the Driver Dashboard's Statistics tab
 *     (`src/components/driver/DriverStatsTab.tsx`)
 *
 * Per spec:
 *
 *   TODAY, carried-over from yesterday (driver has NOT edited cargo yet):
 *     → title = "الحمولة المتبقية من اليوم السابق"
 *     Cargo shown = live loads (which equal yesterday's EOD snapshot at
 *     midnight, and decrease as sales happen). Sales decrement loads but
 *     do NOT flip the title — only edits/adds do.
 *
 *   TODAY, after driver edits/adds cargo:
 *     → title = "الحمولة الحالية"
 *     Cargo shown = live loads (editable).
 *
 *   TODAY, when yesterday's snapshot had ZERO remaining cargo:
 *     → title = "الحمولة الحالية" (default state, no carry-over)
 *
 *   YESTERDAY or ANY OLDER past day:
 *     → title = "الحمولة المتبقية من هذا اليوم" (immutable snapshot)
 *
 *   FUTURE day:
 *     → title = "الحمولة الحالية" (live loads, empty)
 *
 * Sales only DECREMENT quantities (never add products, never change prices,
 * never increase a quantity). So we treat the cargo as "edited" only when:
 *   - a product exists in live but not in snapshot (added), OR
 *   - a product exists in snapshot but not in live (removed), OR
 *   - a product's unitPrice differs (price edited), OR
 *   - a product's quantity in live is GREATER than in snapshot
 *     (a sale can only decrease, so an increase means an edit).
 *
 * A quantity decrease alone is treated as a sale (not an edit) — this
 * matches spec C's statement that "This state continues until the driver
 * edits cargo" even as sales happen.
 *
 * Do NOT duplicate this logic — add new callers here.
 */

export interface CargoByKey {
  quantity: number;
  unitPrice: number;
}

/**
 * Index a cargo array by `productName.trim().toLowerCase()`, dropping any
 * qty-0 entries (those are hidden from the UI and must not participate in
 * the carry-over comparison).
 */
export function indexCargoByKey(items: CargoItem[]): Map<string, CargoByKey> {
  const map = new Map<string, CargoByKey>();
  for (const item of items) {
    if (item.quantity > 0) {
      map.set(item.productName.trim().toLowerCase(), {
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      });
    }
  }
  return map;
}

/**
 * True iff the live cargo on TODAY's view is "carried over from yesterday
 * and not yet edited" (spec C). False in any other case (spec D, E, or not
 * today).
 *
 * - `liveCargo` — current `loads` rows for this driver.
 * - `yesterdaySnapshot` — `daily_load_snapshots` row for yesterday, parsed
 *   back into `CargoItem[]`. `null`/`[]` means "no snapshot" (spec E).
 */
export function isCargoCarriedOverToday(
  isToday: boolean,
  liveCargo: CargoItem[],
  yesterdaySnapshot: CargoItem[] | null | undefined,
): boolean {
  if (!isToday) return false;

  const snapByKey = indexCargoByKey(yesterdaySnapshot ?? []);
  // No yesterday snapshot → no carry-over (spec E: zero/missing cargo).
  if (snapByKey.size === 0) return false;

  const liveByKey = indexCargoByKey(liveCargo);

  // Edited if any live product is not in snapshot (added),
  // if any price differs, or if any live quantity is GREATER than the
  // snapshot quantity (a sale can only decrease — an increase is an edit).
  for (const [key, live] of liveByKey) {
    const snap = snapByKey.get(key);
    if (!snap) return false; // added → edited → not carried over
    if (live.unitPrice !== snap.unitPrice) return false; // price edited
    if (live.quantity > snap.quantity) return false; // quantity increased (sale can't)
  }

  // Edited if any snapshot product is not in live (removed).
  for (const key of snapByKey.keys()) {
    if (!liveByKey.has(key)) return false; // removed → edited
  }

  // Quantities may have decreased (sales) — that's still carried over.
  return true;
}

/**
 * Resolve the cargo card title for the given day, applying the midnight
 * carry-over rules described above.
 *
 *   - isToday + carried over (not edited) → "الحمولة المتبقية من اليوم السابق"
 *   - isToday + edited or no carry-over   → "الحمولة الحالية"
 *   - past day (yesterday or older)       → "الحمولة المتبقية من هذا اليوم"
 *   - future day                          → "الحمولة الحالية" (empty)
 */
export function resolveCargoTitle(
  isToday: boolean,
  isLiveDay: boolean,
  carriedOverToday: boolean,
): string {
  if (isToday) {
    return carriedOverToday
      ? 'الحمولة المتبقية من اليوم السابق'
      : 'الحمولة الحالية';
  }
  return isLiveDay
    ? 'الحمولة الحالية'
    : 'الحمولة المتبقية من هذا اليوم';
}
