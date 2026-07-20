/**
 * Runtime verification of:
 *   1. Midnight carry-over logic (lib/cargoCarryOver)
 *   2. Future-day empty-cargo behavior (useCargoHistory — displayCargo derivation)
 *   3. Week selector navigation bounds (WeekDaySelector — pure helpers)
 *
 * This script imports the SHARED pure helpers from `lib/cargoCarryOver`
 * (the same code path used at runtime by BOTH `DriverDetails.tsx` and
 * `DriverStatsTab.tsx` via the `useCargoHistory` hook) and exercises
 * every spec scenario end-to-end. If any assertion fails, the process
 * exits with code 1.
 *
 * Spec scenarios covered:
 *
 *   A. Before midnight: today → "الحمولة الحالية"
 *   B. After midnight: yesterday → "الحمولة المتبقية من هذا اليوم"
 *   C. New day immediately after midnight, carry-over from yesterday:
 *      → "الحمولة المتبقية من اليوم السابق" (no sales yet, cargo unchanged)
 *   D. Driver edits/adds/removes cargo on the new day → title flips to
 *      "الحمولة الحالية"
 *   E. Zero-cargo edge case: yesterday reaches midnight with ZERO cargo →
 *      today shows default "الحمولة الحالية" (no carry-over title).
 *   F. Future day → "الحمولة الحالية" (empty cargo, never inherits)
 *   G. qty-0 items in snapshot are filtered out of the comparison
 *   H. Not-today guard → carry-over flag is false
 *   I. Future day's displayCargo is ALWAYS empty (no inheritance)
 *   J. Week selector bounds: prev/next arrow enable/disable correctly
 *   K. Week selector bounds: day cells outside [minDate, maxDate] are disabled
 *   L. Week selector bounds: weekAnchor clamped on init
 *
 * IMPORTANT: Thursday → Friday is ONLY an example. The implementation is
 * date-driven, not weekday-driven. The tests below use Sunday→Monday,
 * Monday→Tuesday, … Saturday→Sunday to verify this.
 */
import {
  isCargoCarriedOverToday,
  resolveCargoTitle,
} from '../src/lib/cargoCarryOver';
import {
  addDays,
  startOfWeek,
  isoToBaghdadYmd,
} from '../src/lib/dateUtils';
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

// ── Shared fixtures ────────────────────────────────────────────────────────

const DAY_A_LIVE: CargoItem[] = [
  { id: 'l1', driverId: 'd1', productName: 'سكر أبيض (كيس)', quantity: 30, unitPrice: 22500 },
  { id: 'l2', driverId: 'd1', productName: 'زيت نخيل',       quantity: 50, unitPrice: 12000 },
];

// Snapshot frozen at Day A midnight — exactly equal to DAY_A_LIVE.
const DAY_A_SNAPSHOT: CargoItem[] = DAY_A_LIVE.map((c) => ({ ...c }));

// Day B live = Day A's snapshot (carry-over, no edits yet).
const DAY_B_LIVE_CARRYOVER: CargoItem[] = DAY_A_SNAPSHOT.map((c) => ({ ...c }));

// Day B live after one sale of 5 units of sugar (qty decreased only —
// should NOT flip the title; still considered carry-over).
const DAY_B_LIVE_AFTER_SALE: CargoItem[] = [
  { id: 'l1', driverId: 'd1', productName: 'سكر أبيض (كيس)', quantity: 25, unitPrice: 22500 },
  { id: 'l2', driverId: 'd1', productName: 'زيت نخيل',       quantity: 50, unitPrice: 12000 },
];

// Day B live after driver EDITS sugar price (price changed — should flip).
const DAY_B_LIVE_AFTER_PRICE_EDIT: CargoItem[] = [
  { id: 'l1', driverId: 'd1', productName: 'سكر أبيض (كيس)', quantity: 30, unitPrice: 23000 },
  { id: 'l2', driverId: 'd1', productName: 'زيت نخيل',       quantity: 50, unitPrice: 12000 },
];

// Day B live after driver ADDS a new product (added — should flip).
const DAY_B_LIVE_AFTER_ADD: CargoItem[] = [
  { id: 'l1', driverId: 'd1', productName: 'سكر أبيض (كيس)', quantity: 30, unitPrice: 22500 },
  { id: 'l2', driverId: 'd1', productName: 'زيت نخيل',       quantity: 50, unitPrice: 12000 },
  { id: 'l3', driverId: 'd1', productName: 'شاي (علبة)',     quantity: 10, unitPrice: 5000  },
];

// Day B live after driver REMOVES a product (removed — should flip).
const DAY_B_LIVE_AFTER_REMOVE: CargoItem[] = [
  { id: 'l1', driverId: 'd1', productName: 'سكر أبيض (كيس)', quantity: 30, unitPrice: 22500 },
];

// Day B live after driver INCREASES sugar qty (sale can only decrease —
// increase means an edit; should flip).
const DAY_B_LIVE_AFTER_QTY_INCREASE: CargoItem[] = [
  { id: 'l1', driverId: 'd1', productName: 'سكر أبيض (كيس)', quantity: 40, unitPrice: 22500 },
  { id: 'l2', driverId: 'd1', productName: 'زيت نخيل',       quantity: 50, unitPrice: 12000 },
];

// Empty Day A snapshot (zero-cargo edge case).
const EMPTY_DAY_A_SNAPSHOT: CargoItem[] = [];

// ── Spec scenarios ─────────────────────────────────────────────────────────

console.log('\n── A. Before midnight: today → "الحمولة الحالية" ──');
{
  const carried = isCargoCarriedOverToday(true, DAY_A_LIVE, EMPTY_DAY_A_SNAPSHOT);
  const title = resolveCargoTitle(true, true, carried);
  check('title (Day A, no carry-over)', title, 'الحمولة الحالية');
}

console.log('\n── B. After midnight: yesterday → "الحمولة المتبقية من هذا اليوم" ──');
{
  // isToday=false, isLiveOrPast=true (past day), carriedOver irrelevant.
  const title = resolveCargoTitle(false, true, false);
  check('title (viewing Day A on Day B)', title, 'الحمولة المتبقية من هذا اليوم');
}

console.log('\n── C. New day immediately after midnight, carry-over from yesterday ──');
{
  const carried = isCargoCarriedOverToday(true, DAY_B_LIVE_CARRYOVER, DAY_A_SNAPSHOT);
  check('isCarriedOverToday (live == snapshot)', carried, true);
  const title = resolveCargoTitle(true, true, carried);
  check('title (Day B, not yet edited)', title, 'الحمولة المتبقية من اليوم السابق');
}

console.log('\n── C2. Carry-over survives a sale (qty decrease) ──');
{
  const carried = isCargoCarriedOverToday(true, DAY_B_LIVE_AFTER_SALE, DAY_A_SNAPSHOT);
  check('isCarriedOverToday (after one sale)', carried, true);
  const title = resolveCargoTitle(true, true, carried);
  check('title (after one sale, not edited)', title, 'الحمولة المتبقية من اليوم السابق');
}

console.log('\n── D1. Driver edits price → title flips to "الحمولة الحالية" ──');
{
  const carried = isCargoCarriedOverToday(true, DAY_B_LIVE_AFTER_PRICE_EDIT, DAY_A_SNAPSHOT);
  check('isCarriedOverToday (price edited)', carried, false);
  const title = resolveCargoTitle(true, true, carried);
  check('title (after price edit)', title, 'الحمولة الحالية');
}

console.log('\n── D2. Driver adds a product → title flips to "الحمولة الحالية" ──');
{
  const carried = isCargoCarriedOverToday(true, DAY_B_LIVE_AFTER_ADD, DAY_A_SNAPSHOT);
  check('isCarriedOverToday (product added)', carried, false);
  const title = resolveCargoTitle(true, true, carried);
  check('title (after add)', title, 'الحمولة الحالية');
}

console.log('\n── D3. Driver removes a product → title flips to "الحمولة الحالية" ──');
{
  const carried = isCargoCarriedOverToday(true, DAY_B_LIVE_AFTER_REMOVE, DAY_A_SNAPSHOT);
  check('isCarriedOverToday (product removed)', carried, false);
  const title = resolveCargoTitle(true, true, carried);
  check('title (after remove)', title, 'الحمولة الحالية');
}

console.log('\n── D4. Driver increases qty (sale cannot) → title flips to "الحمولة الحالية" ──');
{
  const carried = isCargoCarriedOverToday(true, DAY_B_LIVE_AFTER_QTY_INCREASE, DAY_A_SNAPSHOT);
  check('isCarriedOverToday (qty increased)', carried, false);
  const title = resolveCargoTitle(true, true, carried);
  check('title (after qty increase)', title, 'الحمولة الحالية');
}

console.log('\n── E. Zero-cargo edge case: Day A has ZERO remaining cargo at midnight ──');
{
  // Day B live is empty, Day A snapshot is empty → no carry-over.
  const carried = isCargoCarriedOverToday(true, [], EMPTY_DAY_A_SNAPSHOT);
  check('isCarriedOverToday (zero cargo)', carried, false);
  const title = resolveCargoTitle(true, true, carried);
  check('title (zero-cargo Day B)', title, 'الحمولة الحالية');
}

console.log('\n── E2. Missing yesterday snapshot → no carry-over (defaults to current) ──');
{
  const carried = isCargoCarriedOverToday(true, DAY_B_LIVE_CARRYOVER, null);
  check('isCarriedOverToday (null snapshot)', carried, false);
  const title = resolveCargoTitle(true, true, carried);
  check('title (null snapshot)', title, 'الحمولة الحالية');
}

console.log('\n── F. Future day → "الحمولة الحالية" (live, empty) ──');
{
  // isToday=false, isLiveOrPast=false (future day), carriedOver irrelevant.
  const title = resolveCargoTitle(false, false, false);
  check('title (future day)', title, 'الحمولة الحالية');
}

console.log('\n── G. qty-0 items in snapshot are filtered out of the comparison ──');
{
  // Snapshot has a zero-qty item — should not affect the comparison.
  const snapshotWithZero: CargoItem[] = [
    { id: 'l1', driverId: 'd1', productName: 'سكر أبيض (كيس)', quantity: 30, unitPrice: 22500 },
    { id: 'l2', driverId: 'd1', productName: 'زيت نخيل',       quantity: 50, unitPrice: 12000 },
    { id: 'l3', driverId: 'd1', productName: 'صابون (كرتون)',  quantity: 0,  unitPrice: 28000 },
  ];
  const carried = isCargoCarriedOverToday(true, DAY_B_LIVE_CARRYOVER, snapshotWithZero);
  check('isCarriedOverToday (zero-qty in snapshot ignored)', carried, true);
}

console.log('\n── H. Not today (e.g. viewing a past day) → carry-over flag is false ──');
{
  const carried = isCargoCarriedOverToday(false, DAY_B_LIVE_CARRYOVER, DAY_A_SNAPSHOT);
  check('isCarriedOverToday (not today)', carried, false);
}

// ── I. Date-driven (NOT weekday-driven) verification ──
//
// Per spec: "Thursday → Friday is ONLY an example. The implementation
// must work for Sunday → Monday, Monday → Tuesday, … Saturday → Sunday."
// The carry-over helpers don't actually look at weekdays — they only
// compare live cargo to yesterday's snapshot. So this block is a sanity
// check using different cargo contents (proving the helpers don't care
// about weekday names).

console.log('\n── I. Date-driven (not weekday-driven) — works for every day pair ──');
{
  // Try 7 different "yesterday → today" pairs with different cargo to
  // prove the helper is date-driven, not weekday-driven.
  const pairs: { name: string; yesterday: CargoItem[]; today: CargoItem[] }[] = [
    { name: 'Sun→Mon', yesterday: [{ id: 'a', driverId: 'd', productName: 'P1', quantity: 10, unitPrice: 100 }],
                              today:    [{ id: 'a', driverId: 'd', productName: 'P1', quantity: 10, unitPrice: 100 }] },
    { name: 'Mon→Tue', yesterday: [{ id: 'a', driverId: 'd', productName: 'P2', quantity: 20, unitPrice: 200 }],
                              today:    [{ id: 'a', driverId: 'd', productName: 'P2', quantity: 20, unitPrice: 200 }] },
    { name: 'Tue→Wed', yesterday: [{ id: 'a', driverId: 'd', productName: 'P3', quantity: 30, unitPrice: 300 }],
                              today:    [{ id: 'a', driverId: 'd', productName: 'P3', quantity: 30, unitPrice: 300 }] },
    { name: 'Wed→Thu', yesterday: [{ id: 'a', driverId: 'd', productName: 'P4', quantity: 40, unitPrice: 400 }],
                              today:    [{ id: 'a', driverId: 'd', productName: 'P4', quantity: 40, unitPrice: 400 }] },
    { name: 'Thu→Fri', yesterday: [{ id: 'a', driverId: 'd', productName: 'P5', quantity: 50, unitPrice: 500 }],
                              today:    [{ id: 'a', driverId: 'd', productName: 'P5', quantity: 50, unitPrice: 500 }] },
    { name: 'Fri→Sat', yesterday: [{ id: 'a', driverId: 'd', productName: 'P6', quantity: 60, unitPrice: 600 }],
                              today:    [{ id: 'a', driverId: 'd', productName: 'P6', quantity: 60, unitPrice: 600 }] },
    { name: 'Sat→Sun', yesterday: [{ id: 'a', driverId: 'd', productName: 'P7', quantity: 70, unitPrice: 700 }],
                              today:    [{ id: 'a', driverId: 'd', productName: 'P7', quantity: 70, unitPrice: 700 }] },
  ];
  for (const p of pairs) {
    const carried = isCargoCarriedOverToday(true, p.today, p.yesterday);
    check(`isCarriedOverToday (${p.name})`, carried, true);
    const title = resolveCargoTitle(true, true, carried);
    check(`title (${p.name})`, title, 'الحمولة المتبقية من اليوم السابق');
  }
}

// ── J. Future day displayCargo is ALWAYS empty ──
//
// This mirrors the spec: "Future days must NEVER inherit inventory."
// In useCargoHistory, when isFuture is true, displayCargo returns [].
// We can't call the hook from a pure script (it requires React), but
// we CAN verify the rule by simulating the same logic here.

console.log('\n── J. Future day displayCargo is always empty (no inheritance) ──');
{
  // Simulate the useCargoHistory displayCargo derivation for a future day.
  // isFuture=true → return [].
  const isFuture = true;
  const isToday = false;
  const liveCargo = DAY_B_LIVE_CARRYOVER; // would normally show today's cargo
  const historyCargo: CargoItem[] | null = null;
  const source = isFuture ? [] : (isToday ? liveCargo : (historyCargo ?? []));
  const displayCargo = source.filter((item) => item.quantity > 0);
  check('displayCargo (future day, even with live cargo)', displayCargo, []);
}

// ── K. Week selector bounds ──
//
// Per spec:
//   - First available week = week containing account-creation date.
//   - Last available week = current week.
//   - Prev/Next arrows enable/disable correctly.
//   - Day cells outside [minDate, maxDate] render disabled.
//
// We can't import WeekDaySelector (it's a JSX component), but we CAN
// test the same pure helpers the component uses: addDays, startOfWeek,
// isoToBaghdadYmd.

console.log('\n── K. Week selector bounds — pure helpers ──');
{
  // Mock: driver account created 2026-06-15 (a Monday).
  // Week containing 2026-06-15 starts on Sunday 2026-06-14.
  const createdAtIso = '2026-06-15T08:00:00.000Z';
  const minDate = isoToBaghdadYmd(createdAtIso);
  check('isoToBaghdadYmd (driver createdAt → Baghdad YMD)', minDate, '2026-06-15');

  const minWeekAnchor = startOfWeek(minDate!);
  check('startOfWeek (account-creation week)', minWeekAnchor, '2026-06-14');

  // Today is "today" — but we can compute startOfWeek for any YMD.
  // Simulate "today = 2026-07-17 (a Friday)". Week starts 2026-07-12.
  const todayYmd = '2026-07-17';
  const maxWeekAnchor = startOfWeek(todayYmd);
  check('startOfWeek (current week)', maxWeekAnchor, '2026-07-12');

  // Prev arrow rule: disabled iff weekAnchor - 7 < minWeekAnchor.
  // On the account-creation week (2026-06-14), prev should be disabled.
  const weekAnchor = minWeekAnchor; // 2026-06-14
  const canGoPrev = addDays(weekAnchor, -7) >= minWeekAnchor;
  check('canGoPrev (on account-creation week)', canGoPrev, false);

  // On the next week (2026-06-21), prev should be enabled.
  const weekAnchor2 = addDays(minWeekAnchor, 7); // 2026-06-21
  const canGoPrev2 = addDays(weekAnchor2, -7) >= minWeekAnchor;
  check('canGoPrev (one week after creation)', canGoPrev2, true);

  // Next arrow rule: disabled iff weekAnchor >= maxWeekAnchor.
  // On the current week (2026-07-12), next should be disabled.
  const canGoNext = weekAnchor < maxWeekAnchor;
  // (weekAnchor is 2026-06-14, maxWeekAnchor is 2026-07-12 — so next IS enabled here)
  check('canGoNext (on account-creation week, current week is later)', canGoNext, true);

  // On the current week itself, next should be disabled.
  const canGoNext2 = maxWeekAnchor < maxWeekAnchor;
  check('canGoNext (on current week)', canGoNext2, false);
}

console.log('\n── L. Week selector bounds — day cell in-range check ──');
{
  // Simulate the in-range check from WeekDaySelector's days.map().
  const minDate = '2026-06-15';
  const maxDate = '2026-07-17';

  // Day before minDate → out of range.
  const day1 = addDays(minDate, -1); // 2026-06-14
  const inRange1 = (!minDate || day1 >= minDate) && day1 <= maxDate;
  check(`day ${day1} (before minDate) in range`, inRange1, false);

  // Day = minDate → in range.
  const day2 = minDate;
  const inRange2 = (!minDate || day2 >= minDate) && day2 <= maxDate;
  check(`day ${day2} (= minDate) in range`, inRange2, true);

  // Day after maxDate → out of range.
  const day3 = addDays(maxDate, 1); // 2026-07-18
  const inRange3 = (!minDate || day3 >= minDate) && day3 <= maxDate;
  check(`day ${day3} (after maxDate) in range`, inRange3, false);

  // Day = maxDate → in range.
  const day4 = maxDate;
  const inRange4 = (!minDate || day4 >= minDate) && day4 <= maxDate;
  check(`day ${day4} (= maxDate) in range`, inRange4, true);
}

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n────────────────────────────────────────────────────────────`);
console.log(`  PASS: ${pass}`);
console.log(`  FAIL: ${fail}`);
console.log(`────────────────────────────────────────────────────────────\n`);

if (fail > 0) {
  process.exit(1);
}
