import { useMemo, useState } from 'react';
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
}

interface WeekDaySelectorProps {
  /** Currently selected date as YYYY-MM-DD. */
  selectedDate: string;
  /** Called when the user taps a day cell. */
  onSelectDate: (ymd: string) => void;
  /** Earliest snapshot date (YYYY-MM-DD). Disables the prev-week arrow when
   *  the previous week would be entirely before this date. Optional. */
  earliestDate?: string | null;
  /** If false, prevents navigating past the current week. Default true. */
  allowFuture?: boolean;
}

// Width of the fixed arrow overlay (must match the strip's left padding so
// the first day starts just to the right of the arrows at initial render).
const ARROW_OVERLAY_WIDTH = 44; // px

export function WeekDaySelector({
  selectedDate,
  onSelectDate,
  earliestDate,
  allowFuture = true,
}: WeekDaySelectorProps) {
  const today = useMemo(() => baghdadToday(), []);
  // Anchor = Sunday starting the visible week. Initialized to the week
  // containing `selectedDate` so external resets of selectedDate are
  // reflected.
  const [weekAnchor, setWeekAnchor] = useState<string>(() =>
    startOfWeek(selectedDate)
  );

  const days: DayCell[] = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const ymd = addDays(weekAnchor, i);
      const [y, m, d] = ymd.split('-').map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      return {
        ymd,
        dayName: AR_DAY_FULL[date.getUTCDay()],
        dayNum: date.getUTCDate(),
        monthNum: date.getUTCMonth() + 1,
        isToday: ymd === today,
        isSelected: ymd === selectedDate,
      };
    });
  }, [weekAnchor, today, selectedDate]);

  // Disable prev arrow if the entire previous week is before earliestDate.
  // Previous week's Saturday = weekAnchor - 1 day.
  const canGoPrev = !earliestDate || addDays(weekAnchor, -1) >= earliestDate;
  // Disable next arrow if future is disallowed and we're on the current week.
  const canGoNext = allowFuture || weekAnchor < startOfWeek(today);

  const handlePrev = () => setWeekAnchor((a) => addDays(a, -7));
  const handleNext = () => setWeekAnchor((a) => addDays(a, 7));

  return (
    <div
      dir="ltr"
      className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06] overflow-hidden"
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
            const tone = day.isSelected
              ? 'bg-primary text-white shadow-sm'
              : day.isToday
                ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                : 'text-foreground hover:bg-muted';
            return (
              <button
                key={day.ymd}
                onClick={() => onSelectDate(day.ymd)}
                className={`${base} ${tone}`}
                data-testid={`day-cell-${day.ymd}`}
                aria-pressed={day.isSelected}
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

      {/* ── Fixed arrow overlay (opaque, pins to left edge as boundary) ── */}
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
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={handleNext}
          disabled={!canGoNext}
          className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none"
          aria-label="الأسبوع التالي"
          data-testid="btn-next-week"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
