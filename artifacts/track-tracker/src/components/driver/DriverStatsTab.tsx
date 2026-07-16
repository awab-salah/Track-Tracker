import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Package, ShoppingCart, Receipt, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { ReceiptViewerModal } from '@/components/ReceiptViewerModal';
import { LiveLocationMap } from './LiveLocationMap';
import { useApp } from '@/store/AppContext';
import type { LocationCoords, TrackingStatus } from '@/hooks/useLocationTracking';
import {
  getDriverCargo,
  getDriverSales,
  getWeeklyPerformance,
  getStartOfWeek,
  formatIQD,
  pluralizeUnit,
  type CargoItem,
} from '@/data/mockData';
import { fetchDailySnapshots, fetchEarliestSnapshotDate } from '@/services/loadRepository';

/** Format a YYYY-MM-DD date for the daily nav label (Arabic day name + DD/MM). */
const AR_DAYS_SHORT: Record<string, string> = {
  '0': 'الأحد', '1': 'الاثنين', '2': 'الثلاثاء',
  '3': 'الأربعاء', '4': 'الخميس', '5': 'الجمعة', '6': 'السبت',
};
function formatHistoryLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${AR_DAYS_SHORT[String(d.getDay())] ?? ''} ${dd}/${mm}`;
}

/** Returns YYYY-MM-DD for `offset` days from today in Baghdad local time. */
function baghdadDateOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });
}

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

function SectionTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={16} className="text-primary shrink-0" />
      <h3 className="font-extrabold text-[15px] text-foreground">{title}</h3>
    </div>
  );
}

interface DriverStatsTabProps {
  onEditLoad: (item: CargoItem) => void;
  locationState: {
    status: TrackingStatus;
    coords: LocationCoords | null;
    locationError: string | null;
  };
}

export function DriverStatsTab({ onEditLoad, locationState }: DriverStatsTabProps) {
  const { currentDriver, loads, sales } = useApp();
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  const [weekOffset, setWeekOffset] = useState(0);
  const thisSunday = useMemo(() => getStartOfWeek(new Date()), []);

  // ── Daily history navigation ──
  // dayOffset: 0 = today (live cargo), -1 = yesterday, -2 = day before, etc.
  const [dayOffset, setDayOffset] = useState(0);
  const [historyCargo, setHistoryCargo] = useState<CargoItem[] | null>(null);
  const [earliestSnapshotDate, setEarliestSnapshotDate] = useState<string | null>(null);

  const driverId = currentDriver?.id ?? '';
  const cargo = getDriverCargo(loads, driverId);
  const driverSales = getDriverSales(sales, driverId);

  // Selected date for history (null when viewing today/live).
  const selectedDate = useMemo(() => {
    if (dayOffset === 0) return null;
    return baghdadDateOffset(dayOffset);
  }, [dayOffset]);

  // Fetch earliest snapshot date once per driver (gates the "previous" button).
  useEffect(() => {
    if (!driverId) return;
    let cancelled = false;
    void fetchEarliestSnapshotDate(driverId).then((d) => {
      if (!cancelled) setEarliestSnapshotDate(d);
    });
    return () => { cancelled = true; };
  }, [driverId]);

  // Fetch snapshots when a past date is selected; clear when viewing today.
  useEffect(() => {
    if (!driverId || !selectedDate) {
      setHistoryCargo(null);
      return;
    }
    let cancelled = false;
    void fetchDailySnapshots([driverId], selectedDate).then((rows) => {
      if (!cancelled) setHistoryCargo(rows);
    });
    return () => { cancelled = true; };
  }, [driverId, selectedDate]);

  const displayCargo = dayOffset === 0 ? cargo : (historyCargo ?? []);
  const canGoBack =
    earliestSnapshotDate !== null &&
    (dayOffset === 0 || (selectedDate !== null && selectedDate > earliestSnapshotDate));
  const canGoForward = dayOffset < 0;

  // Earliest week that has any sales for THIS driver
  const earliestWeekStart = useMemo(() => {
    if (driverSales.length === 0) return thisSunday;
    const minTime = Math.min(...driverSales.map((s) => new Date(s.date + 'T00:00:00').getTime()));
    return getStartOfWeek(new Date(minTime));
  }, [driverSales, thisSunday]);

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
    <motion.div
      key="stats-tab"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 pb-8"
    >
      {/* ── Current load ── */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06]">
        <SectionTitle icon={Package} title="الحمولة الحالية" />

        {/* ── Daily navigation (clone of weekly chevron pattern) ── */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setDayOffset((o) => o - 1)}
            disabled={!canGoBack}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none"
            aria-label="اليوم السابق"
          >
            <ChevronRight size={18} />
          </button>
          <span className="text-xs font-bold text-foreground">
            {dayOffset === 0 ? 'اليوم' : formatHistoryLabel(selectedDate!)}
          </span>
          <button
            onClick={() => setDayOffset((o) => o + 1)}
            disabled={!canGoForward}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none"
            aria-label="اليوم التالي"
          >
            <ChevronLeft size={18} />
          </button>
        </div>

        {displayCargo.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2 text-center">
            {dayOffset === 0 ? 'لا توجد حمولة حالياً' : 'لا توجد بيانات لهذا اليوم'}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {displayCargo.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between bg-muted/50 rounded-xl px-3 py-2.5 gap-4"
              >
                {dayOffset === 0 ? (
                  <button
                    onClick={() => onEditLoad(item)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-primary hover:bg-primary/10 transition-colors shrink-0"
                    data-testid={`btn-edit-load-${item.id}`}
                  >
                    <Pencil size={14} />
                  </button>
                ) : (
                  <div className="w-8 h-8 shrink-0" aria-hidden />
                )}
                <div className="flex flex-col gap-1 text-left shrink-0">
                  <p className="text-xs text-muted-foreground">السعر / وحدة</p>
                  <p className="text-sm font-bold text-foreground">{formatIQD(item.unitPrice)}</p>
                </div>
                <div className="flex flex-col gap-1 text-right flex-1">
                  <p className="text-[13px] font-bold text-foreground">{item.productName}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} {pluralizeUnit(item.quantity)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Sales history ── */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06]">
        <SectionTitle icon={ShoppingCart} title="سجل المبيعات" />
        {driverSales.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2 text-center">لا توجد مبيعات بعد</p>
        ) : (
          <div className="flex flex-col gap-2">
            {driverSales.map((sale) => (
              <div
                key={sale.id}
                className="flex flex-col gap-2 bg-muted/50 rounded-xl px-3 py-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <p className="text-xs text-muted-foreground">الإجمالي</p>
                    <p className="text-sm font-bold" style={{ color: '#C97A56' }}>
                      {formatIQD(sale.totalPrice)}
                    </p>
                  </div>
                  <div className="text-right">
                    {sale.items.map((line, idx) => (
                      <div key={idx}>
                        <p className="text-[13px] font-bold text-foreground">{line.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          {line.quantity} {pluralizeUnit(line.quantity)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                {sale.receiptImageUrl && (
                  <button
                    onClick={() => setReceiptUrl(sale.receiptImageUrl!)}
                    className="self-start flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors"
                    data-testid={`btn-view-receipt-${sale.id}`}
                  >
                    <Receipt size={13} />
                    عرض الإيصال
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Weekly chart ── */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06]">
        <SectionTitle icon={ShoppingCart} title="مبيعات هذا الأسبوع" />
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
      </div>

      {/* ── Live location tracking ── */}
      <LiveLocationMap
        status={locationState.status}
        coords={locationState.coords}
        locationError={locationState.locationError}
      />

      <ReceiptViewerModal imageUrl={receiptUrl} onClose={() => setReceiptUrl(null)} />
    </motion.div>
  );
}