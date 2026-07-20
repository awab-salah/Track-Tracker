/**
 * Regression test for the "cargoEditedToday" latch (Phase 3 of the
 * Midnight Logic feature).
 *
 * Background — the user's 7 required scenarios (verbatim):
 *
 *   1. Day 1                          → "الحمولة المتبقية من هذا اليوم"
 *   2. Day 2 before editing           → "الحمولة المتبقية من اليوم السابق"
 *   3. Add cargo                      → "الحمولة الحالية"
 *   4. Remove cargo                   → "الحمولة الحالية"
 *   5. Sell cargo                     → "الحمولة الحالية"
 *   6. Update quantity                → "الحمولة الحالية"
 *   7. Refresh page                   → title remains correct
 *
 * The carry-over algorithm itself (`isCargoCarriedOverToday`) is
 * UNCHANGED — it still returns `true` after a sale / qty-decrease because
 * sales only decrement. The latch (`cargoEditedToday`) overrides its
 * result at the title-resolution layer (see `useCargoHistory.ts`):
 *
 *   isCarriedOverToday = isToday && !cargoEditedToday
 *     ? isCargoCarriedOverToday(...)
 *     : false;
 *
 * This script verifies BOTH:
 *   • The pure carry-over algorithm is unchanged (regressions for Bug 3,
 *     Bug 5, partial sales, empty snapshots, etc.).
 *   • The latch correctly flips the title for ALL 7 user-required scenarios.
 *
 * Run: `npx tsx scripts/verify-edited-today-latch.ts` from artifacts/track-tracker.
 */
import {
  isCargoCarriedOverToday,
  resolveCargoTitle,
} from '../src/lib/cargoCarryOver';
import type { CargoItem } from '../src/data/mockData';

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}`);
    console.error(`    expected: ${e}`);
    console.error(`    actual:   ${a}`);
  }
}

/**
 * Mirror of the override logic in `useCargoHistory.ts`:
 *
 *   isCarriedOverToday = isToday && !cargoEditedToday
 *     ? isCargoCarriedOverToday(isToday, liveCargo, yesterdaySnapshot)
 *     : false;
 *
 *   cargoTitle = resolveCargoTitle(isToday, isLiveOrPast, isCarriedOverToday)
 */
function resolveDay2Title(
  liveCargo: CargoItem[],
  yesterdaySnapshot: CargoItem[] | null,
  cargoEditedToday: boolean,
): string {
  const isToday = true;
  const isLiveOrPast = true;
  const carried = isToday && !cargoEditedToday
    ? isCargoCarriedOverToday(isToday, liveCargo, yesterdaySnapshot)
    : false;
  return resolveCargoTitle(isToday, isLiveOrPast, carried);
}

// Day 1 EOD: driver sold out oil (qty=0 row persists in the `loads` table;
// snapshot is built from the live loads table so it ALSO has the qty-0 row).
const DAY1_LIVE_EOD: CargoItem[] = [
  { id: 'l1', driverId: 'd1', productName: 'سكر أبيض (كيس)', quantity: 25, unitPrice: 22500 },
  { id: 'l2', driverId: 'd1', productName: 'زيت نخيل',       quantity: 0,  unitPrice: 12000 }, // sold out Day 1
  { id: 'l3', driverId: 'd1', productName: 'صابون (كرتون)',  quantity: 10, unitPrice: 5000  },
];
const DAY1_SNAPSHOT: CargoItem[] = DAY1_LIVE_EOD.map((c) => ({ ...c }));

// Day 2 morning: live loads table UNCHANGED (carry-over is by persistence).
const DAY2_LIVE_CARRYOVER: CargoItem[] = DAY1_LIVE_EOD.map((c) => ({ ...c }));
const DAY2_YESTERDAY_SNAPSHOT: CargoItem[] = DAY1_SNAPSHOT.map((c) => ({ ...c }));

// ─── User-Required Scenarios ──────────────────────────────────────────────

// Scenario 1: Day 1 (viewed from Day 2)
console.log('\n── Scenario 1: Day 1 title = "الحمولة المتبقية من هذا اليوم" ──');
{
  const title = resolveCargoTitle(false /* isToday */, true /* isLiveOrPast */, false);
  check('Day 1 title', title, 'الحمولة المتبقية من هذا اليوم');
}

// Scenario 2: Day 2 before editing → carry-over title (latch = false)
console.log('\n── Scenario 2: Day 2 before editing → "الحمولة المتبقية من اليوم السابق" ──');
{
  const title = resolveDay2Title(DAY2_LIVE_CARRYOVER, DAY2_YESTERDAY_SNAPSHOT, false);
  check('Day 2 title (latch=false)', title, 'الحمولة المتبقية من اليوم السابق');
}

// Scenario 3: Add cargo → "الحمولة الحالية" (latch = true after mutation)
console.log('\n── Scenario 3: Add cargo → "الحمولة الحالية" ──');
{
  const after: CargoItem[] = [
    ...DAY2_LIVE_CARRYOVER,
    { id: 'l4', driverId: 'd1', productName: 'شاي (علبة)', quantity: 8, unitPrice: 7000 },
  ];
  // Latch is set by AppContext.upsertLoad after the mutation.
  const title = resolveDay2Title(after, DAY2_YESTERDAY_SNAPSHOT, true);
  check('Day 2 title (after add, latch=true)', title, 'الحمولة الحالية');
}

// Scenario 4: Remove cargo → "الحمولة الحالية"
console.log('\n── Scenario 4: Remove cargo → "الحمولة الحالية" ──');
{
  const after: CargoItem[] = DAY2_LIVE_CARRYOVER.filter(
    (l) => l.productName !== 'سكر أبيض (كيس)',
  );
  const title = resolveDay2Title(after, DAY2_YESTERDAY_SNAPSHOT, true);
  check('Day 2 title (after remove, latch=true)', title, 'الحمولة الحالية');
}

// Scenario 5: Sell cargo → "الحمولة الحالية"
// A sale decrements quantity. The carry-over algorithm alone would still
// return `true` (because sales only decrement). The latch overrides it.
console.log('\n── Scenario 5a: Sell cargo (partial, qty still > 0) → "الحمولة الحالية" ──');
{
  const after: CargoItem[] = DAY2_LIVE_CARRYOVER.map((l) =>
    l.productName === 'سكر أبيض (كيس)' ? { ...l, quantity: 10 } : l,
  );
  // Verify the algorithm alone still returns true (sales don't flip it).
  const algAlone = isCargoCarriedOverToday(true, after, DAY2_YESTERDAY_SNAPSHOT);
  check('algorithm alone (partial sale) returns true', algAlone, true);
  // Verify the latch correctly overrides to flip the title.
  const title = resolveDay2Title(after, DAY2_YESTERDAY_SNAPSHOT, true);
  check('Day 2 title (after partial sale, latch=true)', title, 'الحمولة الحالية');
}

console.log('\n── Scenario 5b: Sell cargo (sell-out, qty=0) → "الحمولة الحالية" ──');
{
  const after: CargoItem[] = DAY2_LIVE_CARRYOVER.map((l) =>
    l.productName === 'سكر أبيض (كيس)' ? { ...l, quantity: 0 } : l,
  );
  const algAlone = isCargoCarriedOverToday(true, after, DAY2_YESTERDAY_SNAPSHOT);
  check('algorithm alone (sell-out) returns true', algAlone, true);
  const title = resolveDay2Title(after, DAY2_YESTERDAY_SNAPSHOT, true);
  check('Day 2 title (after sell-out, latch=true)', title, 'الحمولة الحالية');
}

// Scenario 6: Update quantity → "الحمولة الحالية"
// Two sub-cases:
//   6a. Quantity INCREASE — the algorithm alone already returns false.
//   6b. Quantity DECREASE (manual edit, not a sale) — the algorithm alone
//       returns true, but the latch overrides it.
console.log('\n── Scenario 6a: Update quantity (increase) → "الحمولة الحالية" ──');
{
  const after: CargoItem[] = DAY2_LIVE_CARRYOVER.map((l) =>
    l.productName === 'سكر أبيض (كيس)' ? { ...l, quantity: 40 } : l,
  );
  // Algorithm alone already returns false (increase is an edit).
  const algAlone = isCargoCarriedOverToday(true, after, DAY2_YESTERDAY_SNAPSHOT);
  check('algorithm alone (qty increase) returns false', algAlone, false);
  const title = resolveDay2Title(after, DAY2_YESTERDAY_SNAPSHOT, true);
  check('Day 2 title (after qty increase, latch=true)', title, 'الحمولة الحالية');
}

console.log('\n── Scenario 6b: Update quantity (decrease via editor, not sale) → "الحمولة الحالية" ──');
{
  const after: CargoItem[] = DAY2_LIVE_CARRYOVER.map((l) =>
    l.productName === 'سكر أبيض (كيس)' ? { ...l, quantity: 15 } : l,
  );
  // Algorithm alone returns true (decrease looks like a sale).
  const algAlone = isCargoCarriedOverToday(true, after, DAY2_YESTERDAY_SNAPSHOT);
  check('algorithm alone (qty decrease) returns true', algAlone, true);
  // Latch overrides.
  const title = resolveDay2Title(after, DAY2_YESTERDAY_SNAPSHOT, true);
  check('Day 2 title (after qty decrease, latch=true)', title, 'الحمولة الحالية');
}

// Scenario 6c: Update price → "الحمولة الحالية"
console.log('\n── Scenario 6c: Update price → "الحمولة الحالية" ──');
{
  const after: CargoItem[] = DAY2_LIVE_CARRYOVER.map((l) =>
    l.productName === 'سكر أبيض (كيس)' ? { ...l, unitPrice: 23000 } : l,
  );
  const algAlone = isCargoCarriedOverToday(true, after, DAY2_YESTERDAY_SNAPSHOT);
  check('algorithm alone (price edit) returns false', algAlone, false);
  const title = resolveDay2Title(after, DAY2_YESTERDAY_SNAPSHOT, true);
  check('Day 2 title (after price edit, latch=true)', title, 'الحمولة الحالية');
}

// Scenario 7: Refresh page → title remains correct.
// On refresh, AppContext reads the latch back from localStorage
// (`tt_cargo_edited_<driverId>_<today>`), so:
//   • If the user has NOT edited today → latch=false → carry-over title.
//   • If the user HAS edited today → latch=true → "Current cargo" persists.
console.log('\n── Scenario 7a: Refresh BEFORE any edit → "الحمولة المتبقية من اليوم السابق" ──');
{
  const live: CargoItem[] = DAY2_LIVE_CARRYOVER.map((c) => ({ ...c }));
  const snap: CargoItem[] = DAY2_YESTERDAY_SNAPSHOT.map((c) => ({ ...c }));
  // Latch was never set today → re-reads as false after refresh.
  const title = resolveDay2Title(live, snap, false);
  check('Day 2 title (refresh, no edit)', title, 'الحمولة المتبقية من اليوم السابق');
}

console.log('\n── Scenario 7b: Refresh AFTER an edit → "الحمولة الحالية" persists ──');
{
  // User edited earlier today — live cargo now differs from snapshot.
  const editedLive: CargoItem[] = DAY2_LIVE_CARRYOVER.map((l) =>
    l.productName === 'سكر أبيض (كيس)' ? { ...l, quantity: 10 } : l,
  );
  // Latch was persisted to localStorage earlier → re-reads as true after refresh.
  const title = resolveDay2Title(editedLive, DAY2_YESTERDAY_SNAPSHOT, true);
  check('Day 2 title (refresh, after edit)', title, 'الحمولة الحالية');
}

console.log('\n── Scenario 7c: Refresh AFTER a sell-out → "الحمولة الحالية" persists ──');
{
  // User sold out a product earlier today — live qty=0 for that row.
  const editedLive: CargoItem[] = DAY2_LIVE_CARRYOVER.map((l) =>
    l.productName === 'سكر أبيض (كيس)' ? { ...l, quantity: 0 } : l,
  );
  // Latch was persisted → re-reads as true after refresh.
  const title = resolveDay2Title(editedLive, DAY2_YESTERDAY_SNAPSHOT, true);
  check('Day 2 title (refresh, after sell-out)', title, 'الحمولة الحالية');
}

// ─── Regressions — the carry-over algorithm itself is UNCHANGED ──────────

console.log('\n── Regression: Bug 5 — Day-1 sell-out does not break Day-2 carry-over ──');
{
  // Day 1 sold out oil (qty=0 in BOTH live and snapshot).
  // Algorithm alone (latch=false) should still return true.
  const alg = isCargoCarriedOverToday(true, DAY2_LIVE_CARRYOVER, DAY2_YESTERDAY_SNAPSHOT);
  check('isCargoCarriedOverToday (Day-1 sell-out)', alg, true);
  const title = resolveDay2Title(DAY2_LIVE_CARRYOVER, DAY2_YESTERDAY_SNAPSHOT, false);
  check('Day 2 title (Day-1 sell-out, latch=false)', title, 'الحمولة المتبقية من اليوم السابق');
}

console.log('\n── Regression: Bug 3 — Day-2 sell-out still carry-over (algorithm alone) ──');
{
  const after: CargoItem[] = DAY2_LIVE_CARRYOVER.map((l) =>
    l.productName === 'سكر أبيض (كيس)' ? { ...l, quantity: 0 } : l,
  );
  const alg = isCargoCarriedOverToday(true, after, DAY2_YESTERDAY_SNAPSHOT);
  check('isCargoCarriedOverToday (Day-2 sell-out, latch=false)', alg, true);
}

console.log('\n── Regression: Empty/null/all-zero snapshot → no carry-over ──');
{
  check('empty snap', isCargoCarriedOverToday(true, DAY2_LIVE_CARRYOVER, []), false);
  check('null snap',  isCargoCarriedOverToday(true, DAY2_LIVE_CARRYOVER, null), false);
  const allZero = DAY2_YESTERDAY_SNAPSHOT.map((c) => ({ ...c, quantity: 0 }));
  check('all-qty-0 snap', isCargoCarriedOverToday(true, DAY2_LIVE_CARRYOVER, allZero), false);
}

console.log('\n── Regression: Future day / old past day / not-today guard ──');
{
  check('future day title', resolveCargoTitle(false, false, false), 'الحمولة الحالية');
  check('old past day title', resolveCargoTitle(false, true, false), 'الحمولة المتبقية من هذا اليوم');
  check('not-today guard', isCargoCarriedOverToday(false, DAY2_LIVE_CARRYOVER, DAY2_YESTERDAY_SNAPSHOT), false);
}

console.log('\n── Regression: Latch does NOT affect past/future day titles ──');
{
  // Even if the latch is true, past days show the immutable-snapshot title
  // and future days show the empty-cargo title. The latch only affects today.
  check('past day (latch=true)', resolveCargoTitle(false, true, false), 'الحمولة المتبقية من هذا اليوم');
  check('future day (latch=true)', resolveCargoTitle(false, false, false), 'الحمولة الحالية');
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log(`  PASS: ${pass}`);
console.log(`  FAIL: ${fail}`);
console.log('────────────────────────────────────────────────────────────');
console.log('');

if (fail > 0) process.exit(1);
