/**
 * Runtime verification of the midnight carry-over logic.
 *
 * This script imports the SHARED pure helpers from `lib/cargoCarryOver`
 * (the same code path used at runtime by BOTH `DriverDetails.tsx` and
 * `DriverStatsTab.tsx` via the `useCargoHistory` hook) and exercises
 * every spec scenario end-to-end. If any assertion fails, the process
 * exits with code 1.
 *
 * Spec scenarios covered:
 *
 *   A. Before midnight: today (Thursday) → "الحمولة الحالية"
 *   B. After midnight: yesterday (Thursday) → "الحمولة المتبقية من هذا اليوم"
 *   C. New day (Friday) immediately after midnight, carry-over from Thursday:
 *      → "الحمولة المتبقية من اليوم السابق" (no sales yet, cargo unchanged)
 *   D. Driver edits cargo on the new day → title flips to "الحمولة الحالية"
 *   E. Zero-cargo edge case: Thursday reaches midnight with ZERO cargo →
 *      Friday shows default "الحمولة الحالية" (no carry-over title).
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

// ── Shared fixtures ────────────────────────────────────────────────────────

const THURSDAY_LIVE: CargoItem[] = [
  { id: 'l1', driverId: 'd1', productName: 'سكر أبيض (كيس)', quantity: 30, unitPrice: 22500 },
  { id: 'l2', driverId: 'd1', productName: 'زيت نخيل',       quantity: 50, unitPrice: 12000 },
];

// Snapshot frozen at Thursday midnight — exactly equal to THURSDAY_LIVE.
const THURSDAY_SNAPSHOT: CargoItem[] = THURSDAY_LIVE.map((c) => ({ ...c }));

// Friday live = Thursday's snapshot (carry-over, no edits yet).
const FRIDAY_LIVE_CARRYOVER: CargoItem[] = THURSDAY_SNAPSHOT.map((c) => ({ ...c }));

// Friday live after one sale of 5 units of sugar (qty decreased only —
// should NOT flip the title; still considered carry-over).
const FRIDAY_LIVE_AFTER_SALE: CargoItem[] = [
  { id: 'l1', driverId: 'd1', productName: 'سكر أبيض (كيس)', quantity: 25, unitPrice: 22500 },
  { id: 'l2', driverId: 'd1', productName: 'زيت نخيل',       quantity: 50, unitPrice: 12000 },
];

// Friday live after driver EDITS sugar price (price changed — should flip).
const FRIDAY_LIVE_AFTER_PRICE_EDIT: CargoItem[] = [
  { id: 'l1', driverId: 'd1', productName: 'سكر أبيض (كيس)', quantity: 30, unitPrice: 23000 },
  { id: 'l2', driverId: 'd1', productName: 'زيت نخيل',       quantity: 50, unitPrice: 12000 },
];

// Friday live after driver ADDS a new product (added — should flip).
const FRIDAY_LIVE_AFTER_ADD: CargoItem[] = [
  { id: 'l1', driverId: 'd1', productName: 'سكر أبيض (كيس)', quantity: 30, unitPrice: 22500 },
  { id: 'l2', driverId: 'd1', productName: 'زيت نخيل',       quantity: 50, unitPrice: 12000 },
  { id: 'l3', driverId: 'd1', productName: 'شاي (علبة)',     quantity: 10, unitPrice: 5000  },
];

// Friday live after driver REMOVES a product (removed — should flip).
const FRIDAY_LIVE_AFTER_REMOVE: CargoItem[] = [
  { id: 'l1', driverId: 'd1', productName: 'سكر أبيض (كيس)', quantity: 30, unitPrice: 22500 },
];

// Friday live after driver INCREASES sugar qty (sale can only decrease —
// increase means an edit; should flip).
const FRIDAY_LIVE_AFTER_QTY_INCREASE: CargoItem[] = [
  { id: 'l1', driverId: 'd1', productName: 'سكر أبيض (كيس)', quantity: 40, unitPrice: 22500 },
  { id: 'l2', driverId: 'd1', productName: 'زيت نخيل',       quantity: 50, unitPrice: 12000 },
];

// Empty Thursday snapshot (zero-cargo edge case).
const EMPTY_THURSDAY_SNAPSHOT: CargoItem[] = [];

// ── Spec scenarios ─────────────────────────────────────────────────────────

console.log('\n── A. Before midnight: today (Thursday) → "الحمولة الحالية" ──');
{
  const carried = isCargoCarriedOverToday(true, THURSDAY_LIVE, EMPTY_THURSDAY_SNAPSHOT);
  // No snapshot for "yesterday" (since before midnight, yesterday was a
  // different day with no carry-over concept yet) → default title.
  const title = resolveCargoTitle(true, true, carried);
  check('title (Thursday, no carry-over)', title, 'الحمولة الحالية');
}

console.log('\n── B. After midnight: yesterday (Thursday) → "الحمولة المتبقية من هذا اليوم" ──');
{
  // isToday=false, isLiveDay=false (past day), carriedOver irrelevant for past days.
  const title = resolveCargoTitle(false, false, false);
  check('title (viewing Thursday on Friday)', title, 'الحمولة المتبقية من هذا اليوم');
}

console.log('\n── C. New day (Friday) immediately after midnight, carry-over from Thursday ──');
{
  const carried = isCargoCarriedOverToday(true, FRIDAY_LIVE_CARRYOVER, THURSDAY_SNAPSHOT);
  check('isCarriedOverToday (live == snapshot)', carried, true);
  const title = resolveCargoTitle(true, true, carried);
  check('title (Friday, not yet edited)', title, 'الحمولة المتبقية من اليوم السابق');
}

console.log('\n── C2. Carry-over survives a sale (qty decrease) ──');
{
  const carried = isCargoCarriedOverToday(true, FRIDAY_LIVE_AFTER_SALE, THURSDAY_SNAPSHOT);
  check('isCarriedOverToday (after one sale)', carried, true);
  const title = resolveCargoTitle(true, true, carried);
  check('title (after one sale, not edited)', title, 'الحمولة المتبقية من اليوم السابق');
}

console.log('\n── D1. Driver edits price → title flips to "الحمولة الحالية" ──');
{
  const carried = isCargoCarriedOverToday(true, FRIDAY_LIVE_AFTER_PRICE_EDIT, THURSDAY_SNAPSHOT);
  check('isCarriedOverToday (price edited)', carried, false);
  const title = resolveCargoTitle(true, true, carried);
  check('title (after price edit)', title, 'الحمولة الحالية');
}

console.log('\n── D2. Driver adds a product → title flips to "الحمولة الحالية" ──');
{
  const carried = isCargoCarriedOverToday(true, FRIDAY_LIVE_AFTER_ADD, THURSDAY_SNAPSHOT);
  check('isCarriedOverToday (product added)', carried, false);
  const title = resolveCargoTitle(true, true, carried);
  check('title (after add)', title, 'الحمولة الحالية');
}

console.log('\n── D3. Driver removes a product → title flips to "الحمولة الحالية" ──');
{
  const carried = isCargoCarriedOverToday(true, FRIDAY_LIVE_AFTER_REMOVE, THURSDAY_SNAPSHOT);
  check('isCarriedOverToday (product removed)', carried, false);
  const title = resolveCargoTitle(true, true, carried);
  check('title (after remove)', title, 'الحمولة الحالية');
}

console.log('\n── D4. Driver increases qty (sale cannot) → title flips to "الحمولة الحالية" ──');
{
  const carried = isCargoCarriedOverToday(true, FRIDAY_LIVE_AFTER_QTY_INCREASE, THURSDAY_SNAPSHOT);
  check('isCarriedOverToday (qty increased)', carried, false);
  const title = resolveCargoTitle(true, true, carried);
  check('title (after qty increase)', title, 'الحمولة الحالية');
}

console.log('\n── E. Zero-cargo edge case: Thursday has ZERO remaining cargo at midnight ──');
{
  // Friday live is empty, Thursday snapshot is empty → no carry-over.
  const carried = isCargoCarriedOverToday(true, [], EMPTY_THURSDAY_SNAPSHOT);
  check('isCarriedOverToday (zero cargo)', carried, false);
  const title = resolveCargoTitle(true, true, carried);
  check('title (zero-cargo Friday)', title, 'الحمولة الحالية');
}

console.log('\n── E2. Missing yesterday snapshot → no carry-over (defaults to current) ──');
{
  const carried = isCargoCarriedOverToday(true, FRIDAY_LIVE_CARRYOVER, null);
  check('isCarriedOverToday (null snapshot)', carried, false);
  const title = resolveCargoTitle(true, true, carried);
  check('title (null snapshot)', title, 'الحمولة الحالية');
}

console.log('\n── F. Future day → "الحمولة الحالية" (live, empty) ──');
{
  const title = resolveCargoTitle(false, true, false);
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
  const carried = isCargoCarriedOverToday(true, FRIDAY_LIVE_CARRYOVER, snapshotWithZero);
  check('isCarriedOverToday (zero-qty in snapshot ignored)', carried, true);
}

console.log('\n── H. Not today (e.g. viewing a past day) → carry-over flag is false ──');
{
  const carried = isCargoCarriedOverToday(false, FRIDAY_LIVE_CARRYOVER, THURSDAY_SNAPSHOT);
  check('isCarriedOverToday (not today)', carried, false);
}

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n────────────────────────────────────────────────────────────`);
console.log(`  PASS: ${pass}`);
console.log(`  FAIL: ${fail}`);
console.log(`────────────────────────────────────────────────────────────\n`);

if (fail > 0) {
  process.exit(1);
}
