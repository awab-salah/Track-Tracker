import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  getWeeklyPerformance,
  getStartOfWeek,
  formatIQD,
} from '@/data/mockData';
import type { SaleRecord } from '@/data/mockData';

/**
 * Weekly sales bar chart — shared between Driver Statistics tab and
 * Company Driver Details page so both render identically.
 *
 * Features (per spec — must match exactly between the two consumers):
 *   - Bar chart with 7 days of the current selectable week
 *   - Week navigation chevrons (right = previous, left = next) with the
 *     year label in the middle
 *   - Multi-line XAxis tick: day name on top, DD/MM date below
 *   - RTL data: chartData is reversed so Saturday (newest) renders
 *     leftmost, Sunday (oldest) rightmost
 *   - Highlighted bar: index 0 of chartData (Saturday after reverse)
 *     uses the accent color #C97A56; others use #0D4D5A at 0.85 opacity
 *   - Chart height 240, margin bottom 55 (room for multi-line ticks)
 *   - Tooltip: Cairo font, RTL, rounded, accent label "المبيعات"
 *
 * The chart is independent of the day selector — it always shows a full
 * week (Sun..Sat) and has its own prev/next week navigation.
 */

// Custom tick: Recharts categorical axis tick entries do NOT include
// the original data point (no `payload.payload`). Only `value` and `index`
// are available. We use `index` to look up the date from chartData.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const makeMultiLineTick = (data: any[]) =>
  function MultiLineTick({ x, y, payload }: any) {
    const dayName = payload.value as string;
    const dateStr = data[payload.index]?.date as string | undefined;
    const LINE_GAP = 14;
    const TOP_OFFSET = 16;
    if (!dateStr) {
      return (
        <text x={x} y={y + TOP_OFFSET} textAnchor="middle" fill="#888" fontSize={11} fontFamily="Cairo">
          {dayName}
        </text>
      );
    }
    return (
      <text x={x} y={y + TOP_OFFSET} textAnchor="middle" fill="#888" fontSize={11} fontFamily="Cairo">
        <tspan x={x} dy={0}>{dayName}</tspan>
        <tspan x={x} dy={LINE_GAP}>{dateStr}</tspan>
      </text>
    );
  };

interface WeeklySalesChartProps {
  /** All sales in scope for this chart (will be filtered by driverId + week). */
  sales: SaleRecord[];
  /** Driver to scope sales to. If undefined, all sales in `sales` are used. */
  driverId?: string;
}

export function WeeklySalesChart({ sales, driverId }: WeeklySalesChartProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const thisSunday = useMemo(() => getStartOfWeek(new Date()), []);

  // Earliest week that has any sales for THIS driver (gates the prev-week
  // arrow so the user can't navigate to an empty week before any data).
  const earliestWeekStart = useMemo(() => {
    const scoped = driverId ? sales.filter((s) => s.driverId === driverId) : sales;
    if (scoped.length === 0) return thisSunday;
    const minTime = Math.min(...scoped.map((s) => new Date(s.date + 'T00:00:00').getTime()));
    return getStartOfWeek(new Date(minTime));
  }, [sales, driverId, thisSunday]);

  const weekStart = useMemo(() => {
    const d = new Date(thisSunday);
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [thisSunday, weekOffset]);
  const weekYear = weekStart.getFullYear();
  const isCurrentWeek = weekOffset === 0;
  const isEarliestWeek = weekStart.getTime() === earliestWeekStart.getTime();

  const performance = useMemo(
    () => getWeeklyPerformance(sales, driverId, weekStart),
    [sales, driverId, weekStart],
  );

  // RTL: reverse so Saturday (newest) renders leftmost, Sunday (oldest) rightmost.
  const chartData = useMemo(() => [...performance].reverse(), [performance]);

  return (
    <>
      <p className="text-xs text-muted-foreground mb-1">بالدينار العراقي</p>

      {/* ── Week navigation ── */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setWeekOffset((o) => o - 1)}
          disabled={isEarliestWeek}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none"
          aria-label="الأسبوع السابق"
        >
          <ChevronRight size={18} />
        </button>
        <span className="text-sm font-bold text-foreground tabular-nums">{weekYear}</span>
        <button
          onClick={() => setWeekOffset((o) => o + 1)}
          disabled={isCurrentWeek}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none"
          aria-label="الأسبوع التالي"
        >
          <ChevronLeft size={18} />
        </button>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 55 }}>
          <XAxis
            dataKey="day"
            tick={makeMultiLineTick(chartData)}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis hide />
          <Tooltip
            formatter={(val: number) => [formatIQD(val), 'المبيعات']}
            contentStyle={{
              fontFamily: 'Cairo',
              direction: 'rtl',
              borderRadius: 12,
              border: 'none',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            }}
            cursor={{ fill: 'rgba(13,77,90,0.06)' }}
          />
          <Bar dataKey="sales" radius={[6, 6, 0, 0]} maxBarSize={36}>
            {chartData.map((_, i) => (
              <Cell
                key={i}
                fill={i === 0 ? '#C97A56' : '#0D4D5A'}
                fillOpacity={i === 0 ? 1 : 0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}
