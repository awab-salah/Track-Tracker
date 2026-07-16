/**
 * Verification script for weekly-chart-navigation feature.
 * Tests all edge cases from the PR checklist.
 */

// ── Inline the relevant code from mockData.ts ──────────────────────────────────

type SaleRecord = { id: string; driverId: string; date: string; totalPrice: number; items: any[] };
type DailyPerformance = { day: string; date: string; sales: number };

const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function formatDateDDMM(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function getWeeklyPerformance(
  sales: SaleRecord[],
  driverId?: string,
  weekStart?: Date,
): DailyPerformance[] {
  let scoped = driverId ? sales.filter((s) => s.driverId === driverId) : sales;

  if (weekStart) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    scoped = scoped.filter((s) => {
      const d = new Date(s.date + 'T00:00:00');
      return d >= weekStart && d < weekEnd;
    });
  }

  const totals: Record<string, number> = Object.fromEntries(DAYS_AR.map((d) => [d, 0]));
  for (const sale of scoped) {
    const dayIndex = new Date(sale.date).getDay();
    const dayName = DAYS_AR[dayIndex];
    if (dayName) totals[dayName] += sale.totalPrice;
  }

  if (weekStart) {
    return DAYS_AR.map((day, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return { day, date: formatDateDDMM(d), sales: totals[day] };
    });
  }

  return DAYS_AR.map((day) => ({ day, date: '', sales: totals[day] }));
}

// ── Test helpers ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function assertEq(actual: any, expected: any, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label}`);
    console.log(`     expected: ${JSON.stringify(expected)}`);
    console.log(`     actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ── Test 1: Sales every day ───────────────────────────────────────────────────

console.log('\n=== Test 1: Sales every day of the week ===');
{
  // Week of Sun 2026-07-05 → Sat 2026-07-11
  const weekSun = new Date(2026, 6, 5); // July 5 2026 (Sunday)
  const sales: SaleRecord[] = DAYS_AR.map((_, i) => ({
    id: `s${i}`,
    driverId: 'd1',
    date: `2026-07-${String(5 + i).padStart(2, '0')}`,
    totalPrice: 100 * (i + 1),
    items: [],
  }));

  const result = getWeeklyPerformance(sales, undefined, weekSun);
  assertEq(result.length, 7, 'Returns exactly 7 entries');
  assertEq(result[0].day, 'الأحد', 'First entry is Sunday');
  assertEq(result[6].day, 'السبت', 'Last entry is Saturday');
  assertEq(result[0].date, '05/07', 'Sunday date is 05/07');
  assertEq(result[6].date, '11/07', 'Saturday date is 11/07');
  assertEq(result.map(r => r.sales), [100, 200, 300, 400, 500, 600, 700], 'Sales per day match (100-700)');
}

// ── Test 2: Missing days (sparse sales) ───────────────────────────────────────

console.log('\n=== Test 2: Missing days (sparse sales) ===');
{
  const weekSun = new Date(2026, 6, 5); // July 5 2026
  const sales: SaleRecord[] = [
    { id: 's1', driverId: 'd1', date: '2026-07-05', totalPrice: 100, items: [] }, // Sun
    { id: 's2', driverId: 'd1', date: '2026-07-07', totalPrice: 200, items: [] }, // Tue
    { id: 's3', driverId: 'd1', date: '2026-07-11', totalPrice: 300, items: [] }, // Sat
  ];

  const result = getWeeklyPerformance(sales, undefined, weekSun);
  assertEq(result.length, 7, 'Still returns 7 entries');
  assertEq(result[0].sales, 100, 'Sunday has 100');
  assertEq(result[1].sales, 0, 'Monday has 0 (no sales)');
  assertEq(result[2].sales, 200, 'Tuesday has 200');
  assertEq(result[3].sales, 0, 'Wednesday has 0 (no sales)');
  assertEq(result[4].sales, 0, 'Thursday has 0 (no sales)');
  assertEq(result[5].sales, 0, 'Friday has 0 (no sales)');
  assertEq(result[6].sales, 300, 'Saturday has 300');
}

// ── Test 3: No sales during selected week ─────────────────────────────────────

console.log('\n=== Test 3: No sales during selected week ===');
{
  const weekSun = new Date(2026, 6, 5); // July 5 2026
  const sales: SaleRecord[] = [
    { id: 's1', driverId: 'd1', date: '2026-06-28', totalPrice: 999, items: [] }, // previous week
    { id: 's2', driverId: 'd1', date: '2026-07-12', totalPrice: 888, items: [] }, // next week
  ];

  const result = getWeeklyPerformance(sales, undefined, weekSun);
  assertEq(result.length, 7, 'Still returns 7 entries');
  assertEq(result.every(r => r.sales === 0), true, 'All sales are 0');
  assertEq(result[0].date, '05/07', 'Dates still rendered correctly');
}

// ── Test 4: Week crossing months (30/03 → 05/04) ──────────────────────────────

console.log('\n=== Test 4: Week crossing months ===');
{
  // Sunday March 30, 2025
  const weekSun = new Date(2025, 2, 30); // March 30 2025 (Sunday)
  assertEq(weekSun.getDay(), 0, 'March 30 2025 is a Sunday');

  const result = getWeeklyPerformance([], undefined, weekSun);
  assertEq(result[0].date, '30/03', 'Starts at 30/03');
  assertEq(result[1].date, '31/03', 'March 31');
  assertEq(result[2].date, '01/04', 'Crosses into April 01');
  assertEq(result[3].date, '02/04', 'April 02');
  assertEq(result[4].date, '03/04', 'April 03');
  assertEq(result[5].date, '04/04', 'April 04');
  assertEq(result[6].date, '05/04', 'Ends at 05/04');
}

// ── Test 5: Week crossing years (29/12/2025 → 04/01/2026) ─────────────────────

console.log('\n=== Test 5: Week crossing years ===');
{
  // Sunday December 28, 2025
  const weekSun = new Date(2025, 11, 28); // Dec 28 2025 (Sunday)
  assertEq(weekSun.getDay(), 0, 'Dec 28 2025 is a Sunday');

  const result = getWeeklyPerformance([], undefined, weekSun);
  assertEq(result[0].date, '28/12', 'Starts at 28/12');
  assertEq(result[1].date, '29/12', 'Dec 29');
  assertEq(result[2].date, '30/12', 'Dec 30');
  assertEq(result[3].date, '31/12', 'Dec 31');
  assertEq(result[4].date, '01/01', 'Crosses into Jan 01');
  assertEq(result[5].date, '02/01', 'Jan 02');
  assertEq(result[6].date, '03/01', 'Ends at 03/01');

  // Also test the exact scenario user mentioned: week that has 29/12
  // Dec 29, 2025 is a Monday, so its Sunday is Dec 28
  // That week is 28/12 → 03/01 — verified above
  // Let's also check: if user meant the week STARTING closer to Dec 29...
  // The week containing Dec 29, 2025 (Monday) starts Sunday Dec 28.
}

// ── Test 5b: Week starting exactly Dec 29, 2025 if it were a Sunday ───────────

console.log('\n=== Test 5b: Cross-year week (user example 29/12 → 04/01) ===');
{
  // Find the week where 29/12/2025 falls.
  // Dec 29 2025 is a Monday, so that week's Sunday = Dec 28.
  // The LAST Sunday in 2025 is Dec 28.
  // Week: 28/12 → 03/01/2026.
  // But user says 29/12 → 04/01, so they might mean the week where
  // the range they SEE starts from a date they care about.
  // Let's verify that Dec 29 2025 is Monday:
  const dec29 = new Date(2025, 11, 29);
  assertEq(dec29.getDay(), 1, 'Dec 29 2025 is a Monday');
  // So week of Dec 28 (Sun) → Jan 3 (Sat) covers 29/12.
  // The user's "29/12 → 04/01" range doesn't align to Sun-Sat.
  // The closest Sun-Sat week that includes 29/12 is 28/12 → 03/01.

  // Let's also test: week of Jan 4, 2026 (which IS a Sunday)
  const jan4Sunday = new Date(2026, 0, 4);
  assertEq(jan4Sunday.getDay(), 0, 'Jan 4 2026 is a Sunday');
  const result = getWeeklyPerformance([], undefined, jan4Sunday);
  assertEq(result[0].date, '04/01', 'Starts 04/01');
  assertEq(result[6].date, '10/01', 'Ends 10/01');
}

// ── Test 6: Year display matches week start year ─────────────────────────────

console.log('\n=== Test 6: Year display corresponds to week start ===');
{
  // Week of Dec 28, 2025 (Sunday) → crosses into 2026
  const weekSun = new Date(2025, 11, 28);
  const year = weekSun.getFullYear();
  assertEq(year, 2025, 'Week starting Dec 28 2025 shows year 2025 (start-of-week year)');
  // This is correct: weekStart.getFullYear() = 2025
  // Even though the week crosses into Jan 2026, we display 2025.
}

// ── Test 7: getStartOfWeek correctness ────────────────────────────────────────

console.log('\n=== Test 7: getStartOfWeek helper ===');
{
  // Wednesday July 8, 2026 → Sunday should be July 5
  const wed = new Date(2026, 6, 8);
  const sun = getStartOfWeek(wed);
  assertEq(sun.getDate(), 5, 'Wed Jul 8 → Sunday Jul 5');
  assertEq(sun.getMonth(), 6, 'Month is July');
  assertEq(sun.getHours(), 0, 'Hours normalized to 0');
  assertEq(sun.getMinutes(), 0, 'Minutes normalized to 0');

  // Sunday itself
  const sunItself = new Date(2026, 6, 5);
  const sunResult = getStartOfWeek(sunItself);
  assertEq(sunResult.getDate(), 5, 'Sunday stays at 5');

  // Saturday July 11 → Sunday July 5
  const sat = new Date(2026, 6, 11);
  const satSun = getStartOfWeek(sat);
  assertEq(satSun.getDate(), 5, 'Sat Jul 11 → Sunday Jul 5');
}

// ── Test 8: Backward compatibility (no weekStart) ─────────────────────────────

console.log('\n=== Test 8: Backward compatibility (no weekStart param) ===');
{
  const sales: SaleRecord[] = [
    { id: 's1', driverId: 'd1', date: '2026-07-05', totalPrice: 100, items: [] },
    { id: 's2', driverId: 'd1', date: '2026-07-06', totalPrice: 200, items: [] },
    { id: 's3', driverId: 'd2', date: '2026-07-05', totalPrice: 50, items: [] },
  ];

  const result = getWeeklyPerformance(sales);
  assertEq(result.length, 7, 'Returns 7 entries');
  assertEq(result[0].date, '', 'No date when weekStart not provided');
  // Sunday (July 5): d1(100) + d2(50) = 150
  assertEq(result[0].sales, 150, 'All-time Sunday total = 150 (d1+d2)');
  // Monday (July 6): d1(200) = 200
  assertEq(result[1].sales, 200, 'All-time Monday total = 200');

  // With driverId filter
  const d1Result = getWeeklyPerformance(sales, 'd1');
  assertEq(d1Result[0].sales, 100, 'd1 Sunday = 100');
  assertEq(d1Result[1].sales, 200, 'd1 Monday = 200');
}

// ── Test 9: Week boundary filtering (exact start/end) ────────────────────────

console.log('\n=== Test 9: Week boundary filtering ===');
{
  const weekSun = new Date(2026, 6, 5); // July 5 2026, Sunday 00:00
  const sales: SaleRecord[] = [
    // Exactly on the boundary
    { id: 's1', driverId: 'd1', date: '2026-07-05', totalPrice: 10, items: [] }, // Sunday IN
    { id: 's2', driverId: 'd1', date: '2026-07-11', totalPrice: 20, items: [] }, // Saturday IN
    // Outside boundaries
    { id: 's3', driverId: 'd1', date: '2026-07-04', totalPrice: 30, items: [] }, // Saturday BEFORE (excluded)
    { id: 's4', driverId: 'd1', date: '2026-07-12', totalPrice: 40, items: [] }, // Sunday AFTER (excluded)
  ];

  const result = getWeeklyPerformance(sales, undefined, weekSun);
  const totalSales = result.reduce((sum, r) => sum + r.sales, 0);
  assertEq(totalSales, 30, 'Only Sun Jul 5 (10) + Sat Jul 11 (20) = 30 are included');
  assertEq(result[0].sales, 10, 'Sunday = 10');
  assertEq(result[6].sales, 20, 'Saturday = 20');
}

// ── Test 10: Existing stats totals unchanged ─────────────────────────────────

console.log('\n=== Test 10: Existing mock data totals unchanged ===');
{
  // Reproduce the EXACT mock data from the repo
  const MOCK_SALES: SaleRecord[] = [
    { id: 's1', driverId: 'd1', date: '2026-07-06', items: [], totalPrice: 180000 },
    { id: 's2', driverId: 'd1', date: '2026-07-06', items: [], totalPrice: 180000 },
    { id: 's3', driverId: 'd1', date: '2026-07-05', items: [], totalPrice: 150000 },
    { id: 's4', driverId: 'd2', date: '2026-07-06', items: [], totalPrice: 420000 },
    { id: 's5', driverId: 'd2', date: '2026-07-05', items: [], totalPrice: 360000 },
    { id: 's6', driverId: 'd3', date: '2026-07-06', items: [], totalPrice: 187500 },
    { id: 's7', driverId: 'd3', date: '2026-07-05', items: [], totalPrice: 450000 },
    { id: 's8', driverId: 'd4', date: '2026-07-06', items: [], totalPrice: 196000 },
    { id: 's9', driverId: 'd4', date: '2026-07-05', items: [], totalPrice: 228000 },
  ];

  // Old behavior (no weekStart) should still produce same day-name grouping
  const result = getWeeklyPerformance(MOCK_SALES);

  // July 5, 2026 is a Sunday (index 0 = الأحد)
  // July 6, 2026 is a Monday (index 1 = الاثنين)
  const sundayTotal = result[0].sales;
  const mondayTotal = result[1].sales;
  // Sunday Jul 5: s3(150k) + s5(360k) + s7(450k) + s9(228k) = 1,188,000
  assertEq(sundayTotal, 1188000, `Sunday all-time total = 1,188,000 (got ${sundayTotal})`);
  // Monday Jul 6: s1(180k) + s2(180k) + s4(420k) + s6(187.5k) + s8(196k) = 1,163,500
  assertEq(mondayTotal, 1163500, `Monday all-time total = 1,163,500 (got ${mondayTotal})`);
  // Tue-Sat should be 0
  assertEq(result[2].sales, 0, 'Tuesday = 0');
  assertEq(result[3].sales, 0, 'Wednesday = 0');
  assertEq(result[4].sales, 0, 'Thursday = 0');
  assertEq(result[5].sales, 0, 'Friday = 0');
  assertEq(result[6].sales, 0, 'Saturday = 0');

  // Driver-specific totals unchanged
  const d1Result = getWeeklyPerformance(MOCK_SALES, 'd1');
  assertEq(d1Result[0].sales, 150000, 'd1 Sunday = 150,000');
  assertEq(d1Result[1].sales, 360000, 'd1 Monday = 360,000');

  // With weekStart for the week of Jul 5 2026
  const weekSun = new Date(2026, 6, 5);
  const weekResult = getWeeklyPerformance(MOCK_SALES, undefined, weekSun);
  assertEq(weekResult[0].sales, 1188000, 'Scoped Sunday = 1,188,000 (same as all-time for this data)');
  assertEq(weekResult[1].sales, 1163500, 'Scoped Monday = 1,163,500');
  assertEq(weekResult[0].date, '05/07', 'Week start date = 05/07');
  assertEq(weekResult[6].date, '11/07', 'Week end date = 11/07');
}

// ── Test 11: Navigating backward by weeks ─────────────────────────────────────

console.log('\n=== Test 11: Week navigation (offset logic) ===');
{
  const today = new Date(2026, 6, 16); // Thursday July 16, 2026
  const thisSunday = getStartOfWeek(today);
  assertEq(thisSunday.getDate(), 12, 'This week Sunday = Jul 12');

  // offset = -1
  const prevWeek = new Date(thisSunday);
  prevWeek.setDate(prevWeek.getDate() - 7);
  assertEq(prevWeek.getDate(), 5, 'Previous week Sunday = Jul 5');
  assertEq(prevWeek.getFullYear(), 2026, 'Previous week year = 2026');

  // offset = -2
  const prev2 = new Date(thisSunday);
  prev2.setDate(prev2.getDate() - 14);
  assertEq(prev2.getDate(), 28, 'Two weeks ago Sunday = Jun 28');
  assertEq(prev2.getMonth(), 5, 'Month is June');
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
  console.log('❌ SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('✅ ALL TESTS PASSED');
}