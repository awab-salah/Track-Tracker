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
 *
 * IMPORTANT: qty-0 items in the SNAPSHOT are filtered out (a snapshot row
 * with qty 0 is a phantom that should not participate in the comparison).
 *
 * But qty-0 items in LIVE cargo are KEPT for the comparison — a product
 * that was fully sold out today (live qty=0, snapshot qty>0) is STILL
 * "carried over", not "removed". Per spec: "a sale is not an edit;
 * quantities may decrease, even to 0, and the title stays as carried-over
 * until the driver edits cargo". Treating a sold-out product as "removed"
 * (the previous behaviour) flipped the title to "الحمولة الحالية" the
 * moment any product sold out — see Bug 3 in the worklog.
 *
 * Sales only DECREMENT quantities (never add products, never change prices,
 * never increase a quantity). So we treat the cargo as "edited" only when:
 *   - a product exists in live (any qty, including 0) but not in snapshot (added), OR
 *   - a product exists in snapshot (qty>0) but not in live at all (removed —
 *     NOT "live qty=0"; that's a sell-out, treated as sale), OR
 *   - a product's unitPrice differs (price edited), OR
 *   - a product's quantity in live is GREATER than in snapshot
 *     (a sale can only decrease, so an increase means an edit).
 *
 * A quantity decrease alone is treated as a sale (not an edit) — this
 * matches spec C's statement that "This state continues until the driver
 * edits cargo" even as sales happen.
 */
export function isCargoCarriedOverToday(
  isToday: boolean,
  liveCargo: CargoItem[],
  yesterdaySnapshot: CargoItem[] | null | undefined,
): boolean {
  if (!isToday) return false;

  // Snapshot: drop qty-0 entries — they're phantoms and must not participate.
  const snapByKey = new Map<string, CargoByKey>();
  for (const item of yesterdaySnapshot ?? []) {
    if (item.quantity > 0) {
      snapByKey.set(item.productName.trim().toLowerCase(), {
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      });
    }
  }
  // No yesterday snapshot → no carry-over (spec E: zero/missing cargo).
  if (snapByKey.size === 0) return false;

  // Live: KEEP qty-0 entries. A sold-out product is "still present, qty 0"
  // — it's a sale, not an edit. Only filter out items that don't exist in
  // live AT ALL (truly removed by an edit).
  const liveByKey = new Map<string, CargoByKey>();
  for (const item of liveCargo) {
    liveByKey.set(item.productName.trim().toLowerCase(), {
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    });
  }

  // Edited if any live product is not in snapshot (added),
  // if any price differs, or if any live quantity is GREATER than the
  // snapshot quantity (a sale can only decrease — an increase is an edit).
  for (const [key, live] of liveByKey) {
    const snap = snapByKey.get(key);
    if (!snap) return false; // added → edited → not carried over
    if (live.unitPrice !== snap.unitPrice) return false; // price edited
    if (live.quantity > snap.quantity) return false; // quantity increased (sale can't)
  }

  // Edited if any snapshot product is not in live AT ALL (removed by edit).
  // A product that IS in live but with qty=0 is NOT "removed" — it's a
  // sell-out (sale), which is still carry-over.
  for (const key of snapByKey.keys()) {
    if (!liveByKey.has(key)) return false; // truly removed → edited
  }

  // Quantities may have decreased (sales) — that's still carried over.
  return true;
}

/**
 * Resolve the cargo card title for the given day, applying the midnight
 * carry-over rules described above.
 *
 *   - isToday=true,  carriedOverToday=true   → "الحمولة المتبقية من اليوم السابق"
 *   - isToday=true,  carriedOverToday=false  → "الحمولة الحالية"
 *   - isToday=false, isLiveOrPast=true       → "الحمولة المتبقية من هذا اليوم"
 *                                              (past day — immutable snapshot)
 *   - isToday=false, isLiveOrPast=false      → "الحمولة الحالية"
 *                                              (future day — empty cargo)
 *
 * `isLiveOrPast` is `!isFuture`: today or any past day returns true,
 * strictly-future days return false. The `isToday` branch takes
 * precedence and handles the carry-over title; the second branch only
 * distinguishes past (snapshot) from future (empty).
 */
export function resolveCargoTitle(
  isToday: boolean,
  isLiveOrPast: boolean,
  carriedOverToday: boolean,
): string {
  if (isToday) {
    return carriedOverToday
      ? 'الحمولة المتبقية من اليوم السابق'
      : 'الحمولة الحالية';
  }
  // Past days show the immutable-snapshot title; future days show the
  // default current-cargo title (with empty cargo).
  return isLiveOrPast
    ? 'الحمولة المتبقية من هذا اليوم'
    : 'الحمولة الحالية';
}
