import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Horizontal scrollable 7-day week selector with two small fixed arrows on
 * the visual left for previous/next week navigation.
 *
 * Layout: a single relative container holding
 *   1. a full-width horizontally-scrollable 7-day strip
 *   2. an absolutely-positioned arrow overlay pinned to the left edge
 *
 * The arrow overlay is OPAQUE (matches the card background) so that when
 * the strip scrolls, days slide underneath the arrows and are visually
 * occluded — the arrow area acts as the left screen boundary. The strip
 * has left padding equal to the arrow width so the FIRST day is never
 * trapped behind the arrows at initial render.
 *
 * The strip itself is rendered as an RTL flex container so days appear in
 * normal Arabic reading order from right to left (Sunday on the right,
 * Saturday on the left). The arrow overlay remains pinned to the visual
 * LEFT edge — only the strip direction is reversed, the arrows stay where
 * they are.
 *
 * All date math is done in UTC on YYYY-MM-DD strings to stay timezone-safe
 * regardless of the browser's local timezone. Baghdad timezone (UTC+3, no
 * DST) is used only for the initial "today" computation.
 *
 * ── Navigation bounds (per spec) ──
 *
 *   - First available week = the week containing the driver's account
 *     creation date (`minDate`). The user must NEVER navigate to weeks
 *     before the account-creation week.
 *   - Last available week = the current week (`maxDate` = today). The
 *     user must NEVER navigate to future weeks.
 *   - Prev/Next arrow buttons enable/disable correctly based on these
 *     bounds.
 *   - Day cells outside `[minDate, maxDate]` render as disabled — tapping
 *     them does nothing.
 *   - The internal `weekAnchor` is clamped to
 *     `[startOfWeek(minDate), startOfWeek(maxDate)]` on init and after
 *     every navigation, so swiping / scrolling cannot escape the bounds.
 *
 *   - No fake empty weeks are ever created — days outside the bounds are
 *     simply disabled (greyed out, not clickable).
 */

const BAGHDAD_TZ = 'Asia/Baghdad';

/** Full Arabic weekday names, indexed by JS getDay() (0 = Sunday).
 *  Per spec: use the full forms (الأحد, الاثنين, …) — NOT the abbreviated
 *  forms (أحد, اثنين, …). */
const AR_DAY_FULL: string[] = [
  'الأحد',    // Sun
  'الاثنين',  // Mon
  'الثلاثاء', // Tue
  'الأربعاء', // Wed
  'الخميس',   // Thu
  'الجمعة',   // Fri
  'السبت',    // Sat
];

/** Returns YYYY-MM-DD for today in Baghdad local time. */
function baghdadToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BAGHDAD_TZ });
}

/**
 * Add `offset` days to a YYYY-MM-DD string, returning a new YYYY-MM-DD.
 * Arithmetic is done in UTC to avoid local-timezone drift.
 */
function addDays(ymd: string, offset: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + offset);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Returns YYYY-MM-DD for the Sunday starting the week containing `ymd`. */
function startOfWeek(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = date.getUTCDay(); // 0 = Sun, 6 = Sat
  return addDays(ymd, -dayOfWeek);
}

interface DayCell {
  ymd: string;
  dayName: string;
  dayNum: number;
  monthNum: number;
  isToday: boolean;
  isSelected: boolean;
  /** True iff this day is inside [minDate, maxDate]. Days outside the
   *  bounds render disabled and are not clickable. */
  isInRange: boolean;
}

interface WeekDaySelectorProps {
  /** Currently selected date as YYYY-MM-DD. */
  selectedDate: string;
  /** Called when the user taps a day cell. Not called for out-of-range days. */
  onSelectDate: (ymd: string) => void;
  /**
   * Earliest snapshot date (YYYY-MM-DD) — kept for backward compat with
   * existing callers. When `minDate` is null, this is used as a fallback
   * lower bound for the prev-week arrow.
   */
  earliestDate?: string | null;
  /**
   * Minimum navigable date (YYYY-MM-DD) — the driver's account-creation
   * date in Baghdad local time. The user must never navigate to weeks
   * before the account-creation week. Days before this date render as
   * disabled. Null disables the lower bound (allows navigating all the
   * way back to epoch).
   */
  minDate?: string | null;
  /**
   * Maximum navigable date (YYYY-MM-DD). Defaults to today. The user must
   * never navigate to future weeks. Days after this date render as disabled.
   */
  maxDate?: string;
}

// Width of the fixed arrow overlay (must match the strip's left padding so
// the first day starts just to the right of the arrows at initial render).
const ARROW_OVERLAY_WIDTH = 44; // px

export function WeekDaySelector({
  selectedDate,
  onSelectDate,
  earliestDate,
  minDate,
  maxDate,
}: WeekDaySelectorProps) {
  const today = useMemo(() => baghdadToday(), []);
  const effectiveMaxDate = maxDate ?? today;
  // The effective lower bound is minDate (driver account creation) if
  // provided, falling back to earliestDate (earliest snapshot) for
  // backward compat. If neither is set, the lower bound is null (no clamp).
  const effectiveMinDate = minDate ?? earliestDate ?? null;

  // Compute the clamped week-anchor range once per bounds change.
  const minWeekAnchor = useMemo(
    () => (effectiveMinDate ? startOfWeek(effectiveMinDate) : null),
    [effectiveMinDate],
  );
  const maxWeekAnchor = useMemo(
    () => startOfWeek(effectiveMaxDate),
    [effectiveMaxDate],
  );

  // Anchor = Sunday starting the visible week. Initialized to the week
  // containing `selectedDate` so external resets of selectedDate are
  // reflected. CLAMPED to [minWeekAnchor, maxWeekAnchor] so the user
  // can never see a week outside the bounds — even if `selectedDate`
  // itself is somehow out of range.
  const [weekAnchor, setWeekAnchor] = useState<string>(() => {
    const natural = startOfWeek(selectedDate);
    if (minWeekAnchor && natural < minWeekAnchor) return minWeekAnchor;
    if (natural > maxWeekAnchor) return maxWeekAnchor;
    return natural;
  });

  // Sync `weekAnchor` to follow `selectedDate` when the selected date
  // moves to a different week (e.g. when `handleEditFromHistory` snaps
  // `selectedDate` back to today after the user was browsing a past
  // week). Without this, the user would see the past week with no
  // highlighted cell after such a snap. Clamped to the same bounds as
  // the initializer so external resets cannot escape the bounds either.
  useEffect(() => {
    const natural = startOfWeek(selectedDate);
    let target = natural;
    if (minWeekAnchor && natural < minWeekAnchor) target = minWeekAnchor;
    if (natural > maxWeekAnchor) target = maxWeekAnchor;
    setWeekAnchor((current) => (current === target ? current : target));
  }, [selectedDate, minWeekAnchor, maxWeekAnchor]);

  const days: DayCell[] = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const ymd = addDays(weekAnchor, i);
      const [y, m, d] = ymd.split('-').map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      const inRange =
        (!effectiveMinDate || ymd >= effectiveMinDate) &&
        ymd <= effectiveMaxDate;
      return {
        ymd,
        dayName: AR_DAY_FULL[date.getUTCDay()],
        dayNum: date.getUTCDate(),
        monthNum: date.getUTCMonth() + 1,
        isToday: ymd === today,
        isSelected: ymd === selectedDate,
        isInRange: inRange,
      };
    });
  }, [weekAnchor, today, selectedDate, effectiveMinDate, effectiveMaxDate]);

  // Prev arrow disabled if the previous week's Sunday would be before
  // minWeekAnchor (i.e. the entire previous week is out of bounds).
  const canGoPrev = !minWeekAnchor || addDays(weekAnchor, -7) >= minWeekAnchor;
  // Next arrow disabled if the next week's Sunday would be after
  // maxWeekAnchor (i.e. the entire next week is in the future).
  const canGoNext = weekAnchor < maxWeekAnchor;

  const handlePrev = () => {
    setWeekAnchor((a) => {
      const next = addDays(a, -7);
      if (minWeekAnchor && next < minWeekAnchor) return minWeekAnchor;
      return next;
    });
  };
  const handleNext = () => {
    setWeekAnchor((a) => {
      const next = addDays(a, 7);
      if (next > maxWeekAnchor) return maxWeekAnchor;
      return next;
    });
  };

  return (
    <div
      dir="ltr"
      // `shrink-0` is REQUIRED here. The Statistics tab renders this
      // selector as a flex item inside a `flex flex-col overflow-y-auto`
      // container. Per CSS Flexbox spec, when a flex item has
      // `overflow: hidden` (which we need for the rounded corners to
      // clip the scrollable strip), its automatic minimum size resolves
      // to 0 instead of its content size. Combined with the default
      // `flex-shrink: 1`, the flex algorithm then collapses this card
      // to ~2px tall (just the border) — making the selector invisible
      // at runtime even though it's in the DOM. `shrink-0` opts out of
      // flex shrinking and lets the card keep its natural 53px height.
      className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06] overflow-hidden shrink-0"
      data-testid="week-day-selector"
    >
      {/* ── Scrollable 7-day strip (full width, days slide under arrows) ──
          `dir="rtl"` so the strip starts from the RIGHT: Sunday is the
          first child and renders rightmost, Saturday renders leftmost.
          The arrows stay on the visual left via the parent's LTR overlay. */}
      <div
        dir="rtl"
        className="overflow-x-auto no-scrollbar"
        style={{ paddingLeft: ARROW_OVERLAY_WIDTH, paddingRight: 8, paddingTop: 8, paddingBottom: 8 }}
      >
        <div className="flex gap-1 min-w-min">
          {days.map((day) => {
            const base = 'shrink-0 flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-1.5 min-w-[52px] transition-colors';
            // Out-of-range days render disabled (greyed out, not clickable).
            // In-range days use the same selection/today/default styling as before.
            const tone = !day.isInRange
              ? 'text-muted-foreground/40 cursor-not-allowed'
              : day.isSelected
                ? 'bg-primary text-white shadow-sm'
                : day.isToday
                  ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                  : 'text-foreground hover:bg-muted';
            return (
              <button
                key={day.ymd}
                onClick={() => {
                  // Ignore taps on out-of-range days — they are not
                  // selectable per spec.
                  if (!day.isInRange) return;
                  onSelectDate(day.ymd);
                }}
                disabled={!day.isInRange}
                className={`${base} ${tone}`}
                data-testid={`day-cell-${day.ymd}`}
                aria-pressed={day.isSelected}
                aria-disabled={!day.isInRange}
              >
                <span className="text-[11px] font-bold leading-none">{day.dayName}</span>
                <span className="text-[12px] font-extrabold leading-none tabular-nums">
                  {day.dayNum}/{day.monthNum}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Fixed arrow overlay (opaque, pins to left edge as boundary) ──
          Arrow direction (per spec):
            - Top button (ChevronRight) → previous week
            - Bottom button (ChevronLeft) → next week
          The RTL day strip below is unchanged; only the week-nav direction
          was reversed. */}
      <div
        className="absolute top-0 bottom-0 left-0 flex flex-col items-center justify-center gap-1 bg-white dark:bg-zinc-900 z-10"
        style={{ width: ARROW_OVERLAY_WIDTH }}
      >
        <button
          onClick={handlePrev}
          disabled={!canGoPrev}
          className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none"
          aria-label="الأسبوع السابق"
          data-testid="btn-prev-week"
        >
          <ChevronRight size={16} />
        </button>
        <button
          onClick={handleNext}
          disabled={!canGoNext}
          className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none"
          aria-label="الأسبوع التالي"
          data-testid="btn-next-week"
        >
          <ChevronLeft size={16} />
        </button>
      </div>
    </div>
  );
}
