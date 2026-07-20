/**
 * Regression test for the Day-2 carry-over title bug (Bug 5).
 *
 * Bug 5 (cargoCarryOver.ts): `isCargoCarriedOverToday` filtered qty-0
 * rows out of the snapshot but kept them in live cargo. When Day 1 had
 * a sell-out (live qty=0 row persisted into the snapshot because the
 * snapshot is built from the live loads table), the Day-2 comparison
 * saw the qty-0 row in live but not in snap → mis-classified it as
 * "added today" → returned false → title flipped to "الحمولة الحالية"
 * instead of "الحمولة المتبقية من اليوم السابق".
 *
 *   Fix: keep qty-0 rows in `snapByKeyAll` (used for the "added" check)
 *   so a live qty-0 row that matches a snap qty-0 row is NOT "added".
 *   Use a separate `snapByKeyPositive` (qty-0 filtered) for the "removed"
 *   check, preserving the Bug-3 fix and the test-G scenario.
 *
 * This script verifies the user's 5 required scenarios:
 *   1. Day 1 title = "الحمولة المتبقية من هذا اليوم"
 *   2. Day 2 title (carry-over, no edits) = "الحمولة المتبقية من اليوم السابق"
 *   3. Editing Day 2 cargo (add/remove/price/qty-increase) flips to "الحمولة الحالية"
 *   4. Refreshing the page keeps the correct title
 *   5. (covered by 1-4 above)
 *
 * Plus regressions for the existing Bug-3 fix and edge cases.
 *
 * Run: `npx tsx scripts/verify-day2-title-fix.ts` from artifacts/track-tracker.
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

// Day 1 EOD: driver sold out oil (qty=0 row stays in `loads` table because
// `decrementLoad` floors at 0 but does not delete). The snapshot is built
// FROM the live loads table, so the snapshot ALSO has the qty-0 oil row.
const DAY1_LIVE_EOD: CargoItem[] = [
  { id: 'l1', driverId: 'd1', productName: 'سكر أبيض (كيس)', quantity: 25, unitPrice: 22500 },
  { id: 'l2', driverId: 'd1', productName: 'زيت نخيل',       quantity: 0,  unitPrice: 12000 }, // sold out Day 1
  { id: 'l3', driverId: 'd1', productName: 'صابون (كرتون)',  quantity: 10, unitPrice: 5000  },
];
const DAY1_SNAPSHOT: CargoItem[] = DAY1_LIVE_EOD.map((c) => ({ ...c }));

// Day 2 morning: live loads table UNCHANGED (carry-over is by persistence).
const DAY2_LIVE_CARRYOVER: CargoItem[] = DAY1_LIVE_EOD.map((c) => ({ ...c }));
const DAY2_YESTERDAY_SNAPSHOT: CargoItem[] = DAY1_SNAPSHOT.map((c) => ({ ...c }));

// ── Scenario 1: Day 1 (viewed from Day 2) ──
console.log('\n── Scenario 1: Day 1 title = "الحمولة المتبقية من هذا اليوم" ──');
{
  const title = resolveCargoTitle(false, true, false);
  check('Day 1 title', title, 'الحمولة المتبقية من هذا اليوم');
}

// ── Scenario 2: Day 2 (carry-over, with Day-1 sell-out) ──
console.log('\n── Scenario 2: Day 2 title (carry-over) = "الحمولة المتبقية من اليوم السابق" ──');
{
  const carried = isCargoCarriedOverToday(true, DAY2_LIVE_CARRYOVER, DAY2_YESTERDAY_SNAPSHOT);
  check('isCarriedOverToday (Day-1 sell-out in both live + snap)', carried, true);
  const title = resolveCargoTitle(true, true, carried);
  check('Day 2 title (carry-over)', title, 'الحمولة المتبقية من اليوم السابق');
}

// ── Scenario 3: Editing Day 2 cargo flips to "Current cargo" ──
console.log('\n── Scenario 3a: Day 2 — add product → flips to "الحمولة الحالية" ──');
{
  const after: CargoItem[] = [
    ...DAY2_LIVE_CARRYOVER,
    { id: 'l4', driverId: 'd1', productName: 'شاي (علبة)', quantity: 8, unitPrice: 7000 },
  ];
  const carried = isCargoCarriedOverToday(true, after, DAY2_YESTERDAY_SNAPSHOT);
  check('isCarriedOverToday (after add)', carried, false);
  check('Day 2 title (after add)', resolveCargoTitle(true, true, carried), 'الحمولة الحالية');
}

console.log('\n── Scenario 3b: Day 2 — remove product → flips to "الحمولة الحالية" ──');
{
  const after: CargoItem[] = DAY2_LIVE_CARRYOVER.filter(
    (l) => l.productName !== 'سكر أبيض (كيس)',
  );
  const carried = isCargoCarriedOverToday(true, after, DAY2_YESTERDAY_SNAPSHOT);
  check('isCarriedOverToday (after remove)', carried, false);
  check('Day 2 title (after remove)', resolveCargoTitle(true, true, carried), 'الحمولة الحالية');
}

console.log('\n── Scenario 3c: Day 2 — price edit → flips to "الحمولة الحالية" ──');
{
  const after: CargoItem[] = DAY2_LIVE_CARRYOVER.map((l) =>
    l.productName === 'سكر أبيض (كيس)' ? { ...l, unitPrice: 23000 } : l,
  );
  const carried = isCargoCarriedOverToday(true, after, DAY2_YESTERDAY_SNAPSHOT);
  check('isCarriedOverToday (after price edit)', carried, false);
  check('Day 2 title (after price edit)', resolveCargoTitle(true, true, carried), 'الحمولة الحالية');
}

console.log('\n── Scenario 3d: Day 2 — qty increase → flips to "الحمولة الحالية" ──');
{
  const after: CargoItem[] = DAY2_LIVE_CARRYOVER.map((l) =>
    l.productName === 'سكر أبيض (كيس)' ? { ...l, quantity: 40 } : l,
  );
  const carried = isCargoCarriedOverToday(true, after, DAY2_YESTERDAY_SNAPSHOT);
  check('isCarriedOverToday (after qty increase)', carried, false);
  check('Day 2 title (after qty increase)', resolveCargoTitle(true, true, carried), 'الحمولة الحالية');
}

// ── Scenario 4: Refresh keeps the title ──
console.log('\n── Scenario 4: After refresh, Day 2 title stays "الحمولة المتبقية من اليوم السابق" ──');
{
  const live: CargoItem[] = DAY2_LIVE_CARRYOVER.map((c) => ({ ...c }));
  const snap: CargoItem[] = DAY2_YESTERDAY_SNAPSHOT.map((c) => ({ ...c }));
  const carried = isCargoCarriedOverToday(true, live, snap);
  check('isCarriedOverToday (after refresh)', carried, true);
  check('Day 2 title (after refresh)', resolveCargoTitle(true, true, carried), 'الحمولة المتبقية من اليوم السابق');
}

// ── Regressions (must NOT break) ──

console.log('\n── Regression: Bug 3 — Day-2 sell-out (snap qty>0, live qty=0) still carry-over ──');
{
  const after: CargoItem[] = DAY2_LIVE_CARRYOVER.map((l) =>
    l.productName === 'سكر أبيض (كيس)' ? { ...l, quantity: 0 } : l,
  );
  const carried = isCargoCarriedOverToday(true, after, DAY2_YESTERDAY_SNAPSHOT);
  check('isCarriedOverToday (after Day-2 sell-out)', carried, true);
  check('Day 2 title (after Day-2 sell-out)', resolveCargoTitle(true, true, carried), 'الحمولة المتبقية من اليوم السابق');
}

console.log('\n── Regression: Day-2 partial sale (qty↓ but >0) still carry-over ──');
{
  const after: CargoItem[] = DAY2_LIVE_CARRYOVER.map((l) =>
    l.productName === 'سكر أبيض (كيس)' ? { ...l, quantity: 10 } : l,
  );
  const carried = isCargoCarriedOverToday(true, after, DAY2_YESTERDAY_SNAPSHOT);
  check('isCarriedOverToday (after partial sale)', carried, true);
  check('Day 2 title (after partial sale)', resolveCargoTitle(true, true, carried), 'الحمولة المتبقية من اليوم السابق');
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

// ── Summary ────────────────────────────────────────────────────────────────
console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log(`  PASS: ${pass}`);
console.log(`  FAIL: ${fail}`);
console.log('────────────────────────────────────────────────────────────');
console.log('');

if (fail > 0) process.exit(1);
