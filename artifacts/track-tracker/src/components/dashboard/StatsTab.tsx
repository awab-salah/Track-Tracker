import { motion } from 'framer-motion';
import { useLocation } from 'wouter';
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
  formatIQD,
} from '@/data/mockData';
import { useApp } from '@/store/AppContext';

const SHORT_DAY: Record<string, string> = {
  'الأحد': 'أحد',
  'الاثنين': 'اثنين',
  'الثلاثاء': 'ثلاثاء',
  'الأربعاء': 'أربع',
  'الخميس': 'خميس',
  'الجمعة': 'جمعة',
  'السبت': 'سبت',
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
  const weeklyData = getWeeklyPerformance(sales);
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
        <p className="text-xs text-muted-foreground mt-0.5 mb-4">
          جميع السواق • بالدينار العراقي
        </p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={weeklyData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <XAxis
              dataKey="day"
              tickFormatter={(v) => SHORT_DAY[v] ?? v}
              tick={{ fontFamily: 'Cairo', fontSize: 11, fill: '#888' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(13,77,90,0.06)' }} />
            <Bar dataKey="sales" radius={[6, 6, 0, 0]} maxBarSize={36}>
              {weeklyData.map((_, i) => (
                <Cell
                  key={i}
                  fill={i === weeklyData.length - 1 ? '#C97A56' : '#0D4D5A'}
                  fillOpacity={i === weeklyData.length - 1 ? 1 : 0.85}
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
              // No per-item entrance animation (the parent motion.div already
              // fades/slides the whole list in) — stacking a second JS-driven
              // opacity animation on every item held its own GPU compositing
              // layer, which produced seam/banding artifacts while scrolling.
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
