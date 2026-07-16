import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'wouter';
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
  getDriverTotalSales,
  getWeeklyPerformance,
  getStartOfWeek,
  formatIQD,
} from '@/data/mockData';
import { useApp } from '@/store/AppContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MultiLineTick = ({ x, y, payload }: any) => {
  const dayName = payload.value as string;
  // payload.index maps to the reversed chartData array, so look up date there.
  // We use the `payload` object which Recharts populates from the data entry.
  // The `date` field lives on the same data point — access it via the payload's payload.
  const dateStr = payload.payload?.date as string | undefined;
  if (!dateStr) {
    return (
      <text x={x} y={y} textAnchor="middle" fill="#888" fontSize={11} fontFamily="Cairo">
        {dayName}
      </text>
    );
  }
  return (
    <text x={x} y={y} textAnchor="middle" fill="#888" fontSize={11} fontFamily="Cairo">
      <tspan x={x} dy={0}>{dayName}</tspan>
      <tspan x={x} dy={14}>{dateStr}</tspan>
    </text>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div
        style={{
          background: '#fff',
          border: '1px solid #eee',
          borderRadius: 12,
          padding: '8px 14px',
          fontFamily: 'Cairo,sans-serif',
          direction: 'rtl',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        }}
      >
        <p style={{ fontWeight: 700, fontSize: 13, color: '#0D4D5A', marginBottom: 2 }}>{label}</p>
        <p style={{ fontSize: 12, color: '#C97A56', fontWeight: 600 }}>
          {formatIQD(payload[0].value)}
        </p>
      </div>
    );
  }
  return null;
};

export function StatsTab() {
  const [, setLocation] = useLocation();
  const { drivers, sales } = useApp();

  const [weekOffset, setWeekOffset] = useState(0);
  const thisSunday = useMemo(() => getStartOfWeek(new Date()), []);

  // Earliest week that has any sales (gate for "previous" button)
  const earliestWeekStart = useMemo(() => {
    if (sales.length === 0) return thisSunday;
    const minTime = Math.min(...sales.map((s) => new Date(s.date + 'T00:00:00').getTime()));
    return getStartOfWeek(new Date(minTime));
  }, [sales, thisSunday]);

  const weekStart = useMemo(() => {
    const d = new Date(thisSunday);
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [thisSunday, weekOffset]);
  const weekYear = weekStart.getFullYear();
  const isCurrentWeek = weekOffset === 0;
  const isEarliestWeek = weekStart.getTime() === earliestWeekStart.getTime();

  const weeklyData = useMemo(
    () => getWeeklyPerformance(sales, undefined, weekStart),
    [sales, weekStart],
  );

  // RTL: reverse so Saturday (newest) renders leftmost, Sunday (oldest) rightmost.
  // Recharts always renders data[0] on the left → data[6] on the right.
  // After reverse: index 0 = Saturday (newest/left), index 6 = Sunday (oldest/right).
  const chartData = useMemo(() => [...weeklyData].reverse(), [weeklyData]);

  const sortedDrivers = [...drivers].sort(
    (a, b) => getDriverTotalSales(sales, b.id) - getDriverTotalSales(sales, a.id)
  );

  return (
    <motion.div
      key="stats"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="flex-1 overflow-y-auto p-4 flex flex-col gap-5 pb-6"
    >
      {/* ── Weekly chart ── */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06]">
        <p className="font-extrabold text-foreground text-[15px]">إجمالي المبيعات الأسبوعية</p>
        <p className="text-xs text-muted-foreground mt-0.5 mb-3">
          جميع السواق • بالدينار العراقي
        </p>

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

        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 45 }}>
            <XAxis
              dataKey="day"
              tick={MultiLineTick}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(13,77,90,0.06)' }} />
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
      </div>

      {/* ── Driver ranking ── */}
      <div>
        <p className="text-xs text-muted-foreground font-semibold px-1 mb-3">
          ترتيب السواق حسب المبيعات
        </p>
        <div className="flex flex-col gap-3">
          {sortedDrivers.map((driver, i) => {
            const total = getDriverTotalSales(sales, driver.id);
            return (
              <motion.button
                key={driver.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => setLocation(`/driver/${driver.id}`)}
                className="w-full bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06] flex items-center gap-3 text-right transition-colors active:bg-gray-50"
              >
                <span className="text-xl font-extrabold text-muted-foreground/30 w-7 shrink-0 text-center">
                  {i + 1}
                </span>
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-extrabold">
                  {driver.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0 text-right">
                  <p className="font-bold text-foreground text-[14px] truncate">{driver.name}</p>
                  <p className="text-sm font-bold mt-0.5" style={{ color: '#C97A56' }}>
                    {formatIQD(total)}
                  </p>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}