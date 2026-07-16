import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Horizontal scrollable 7-day week selector with two small fixed arrows on
 * the visual left for previous/next week navigation.
 *
 * Layout: [arrows sidebar | scrollable 7-day strip]
 *
 * - The arrows are in a fixed-width sidebar column on the visual left
 *   (component forces `dir="ltr"` so this stays true regardless of app RTL).
 * - The 7-day strip lives in the remaining width and scrolls horizontally
 *   on narrow screens.
 * - Arrows never scroll with the strip; no day is ever hidden behind them
 *   (no overlap between the two columns).
 *
 * All date math is done in UTC on YYYY-MM-DD strings to stay timezone-safe
 * regardless of the browser's local timezone. Baghdad timezone (UTC+3, no
 * DST) is used only for the initial "today" computation.
 */

const BAGHDAD_TZ = 'Asia/Baghdad';

/** Short Arabic weekday names, indexed by JS getDay() (0 = Sunday). */
const AR_DAY_SHORT: string[] = [
  'أحد',    // Sun
  'اثنين',  // Mon
  'ثلاثاء', // Tue
  'أربع',   // Wed
  'خميس',   // Thu
  'جمعة',   // Fri
  'سبت',    // Sat
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
        dayName: AR_DAY_SHORT[date.getUTCDay()],
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
      className="bg-white dark:bg-zinc-900 rounded-2xl p-2 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06] flex items-stretch gap-1.5"
      data-testid="week-day-selector"
    >
      {/* ── Fixed arrows sidebar (visual left) ── */}
      <div className="flex flex-col items-center justify-center gap-0.5 shrink-0 px-1 border-r border-border/60">
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

      {/* ── Scrollable 7-day strip ── */}
      <div className="flex-1 overflow-x-auto no-scrollbar min-w-0">
        <div className="flex gap-1 min-w-min">
          {days.map((day) => {
            const base = 'shrink-0 flex flex-col items-center justify-center gap-0.5 rounded-xl px-2.5 py-1.5 min-w-[48px] transition-colors';
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
    </div>
  );
}
