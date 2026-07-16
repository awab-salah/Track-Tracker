import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Package, ShoppingCart, Receipt, Pencil } from 'lucide-react';
import { ReceiptViewerModal } from '@/components/ReceiptViewerModal';
import { WeekDaySelector } from '@/components/WeekDaySelector';
import { LiveLocationMap } from './LiveLocationMap';
import { WeeklySalesChart } from './WeeklySalesChart';
import { useApp } from '@/store/AppContext';
import type { LocationCoords, TrackingStatus } from '@/hooks/useLocationTracking';
import {
  getDriverCargo,
  getDriverSales,
  formatIQD,
  pluralizeUnit,
  type CargoItem,
} from '@/data/mockData';
import { fetchDailySnapshots, fetchEarliestSnapshotDate } from '@/services/loadRepository';

const BAGHDAD_TZ = 'Asia/Baghdad';

/** Returns YYYY-MM-DD for today in Baghdad local time. */
function baghdadToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BAGHDAD_TZ });
}

/**
 * Add `offset` days to a YYYY-MM-DD string, returning a new YYYY-MM-DD.
 * Arithmetic is done in UTC to avoid local-timezone drift. (Mirrors the
 * helper used inside WeekDaySelector — kept local to avoid changing
 * repository APIs per spec.)
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

export function DriverStatsTab({
  onEditLoad,
  locationState,
}: DriverStatsTabProps) {
  const { currentDriver, loads, sales, promoteSnapshotToLive } = useApp();
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  // ── Day-based cargo/sales view ──
  // selectedDate lives INSIDE the Statistics tab (per spec: the selector must
  // appear only inside Statistics, NOT at the dashboard level and NOT on the
  // Load or Sales tabs).
  //
  // Title rules (UI only — snapshot generation/storage untouched):
  //   TODAY      → "الحمولة الحالية"                  (live loads, editable)
  //   YESTERDAY  → "الحمولة المتبقية من اليوم السابق"   (immutable snapshot)
  //   ANY OLDER  → "الحمولة المتبقية من هذا اليوم"      (immutable snapshot)
  //   FUTURE     → "الحمولة الحالية"                  (live loads, empty)
  const today = useMemo(() => baghdadToday(), []);
  const yesterday = useMemo(() => addDays(today, -1), [today]);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [earliestSnapshotDate, setEarliestSnapshotDate] = useState<string | null>(null);

  const isToday = selectedDate === today;
  const isYesterday = selectedDate === yesterday;
  // "live" = today OR future: live loads table, editable, empty for future.
  const isLiveDay = selectedDate >= today;

  const [historyCargo, setHistoryCargo] = useState<CargoItem[] | null>(null);

  const driverId = currentDriver?.id ?? '';
  const cargo = getDriverCargo(loads, driverId);
  const driverSales = getDriverSales(sales, driverId);

  // Fetch earliest snapshot date once per driver (gates the prev-week arrow).
  useEffect(() => {
    if (!driverId) return;
    let cancelled = false;
    void fetchEarliestSnapshotDate(driverId).then((d) => {
      if (!cancelled) setEarliestSnapshotDate(d);
    });
    return () => { cancelled = true; };
  }, [driverId]);

  // Fetch snapshot only for past days; clear when viewing today/future.
  useEffect(() => {
    if (!driverId || isLiveDay) {
      setHistoryCargo(null);
      return;
    }
    let cancelled = false;
    void fetchDailySnapshots([driverId], selectedDate).then((rows) => {
      if (!cancelled) setHistoryCargo(rows);
    });
    return () => { cancelled = true; };
  }, [driverId, selectedDate, isLiveDay]);

  // Cargo source: live loads for today/future; snapshot for past days.
  // Per spec: items whose quantity == 0 must NEVER be rendered — apply this
  // to BOTH live and snapshot cargo. The underlying rows in the loads table
  // and the JSONB snapshots are left untouched; this is a UI filter only.
  const displayCargo = useMemo(() => {
    const source = isLiveDay ? cargo : (historyCargo ?? []);
    return source.filter((item) => item.quantity > 0);
  }, [isLiveDay, cargo, historyCargo]);

  // Sales follow the selected day.
  const daySales = useMemo(
    () => driverSales.filter((s) => s.date === selectedDate),
    [driverSales, selectedDate],
  );

  // Cargo card title switches based on day type:
  //   TODAY     → الحمولة الحالية
  //   YESTERDAY → الحمولة المتبقية من اليوم السابق
  //   OLDER     → الحمولة المتبقية من هذا اليوم
  //   FUTURE    → الحمولة الحالية (same as today, but cargo will be empty)
  const cargoTitle = isToday
    ? 'الحمولة الحالية'
    : isYesterday
      ? 'الحمولة المتبقية من اليوم السابق'
      : isLiveDay
        ? 'الحمولة الحالية'
        : 'الحمولة المتبقية من هذا اليوم';

  /**
   * Handle a pencil tap on a HISTORICAL cargo item. Per spec, editing any
   * product from "Remaining Cargo From This Day" immediately promotes that
   * day's snapshot to live Current Cargo. We then snap selectedDate to today
   * (the historical day is now live) and open the Load tab with the matching
   * (now-live) item prefilled.
   */
  const handleEditFromHistory = async (item: CargoItem) => {
    if (!currentDriver) return;
    const newCargo = await promoteSnapshotToLive(currentDriver.id, selectedDate);
    // Snap to today — the historical day is now live.
    setSelectedDate(today);
    // Find the matching live item by product name (case-insensitive, trimmed).
    const liveItem = newCargo.find(
      (c) =>
        c.productName.trim().toLowerCase() === item.productName.trim().toLowerCase(),
    );
    if (liveItem) {
      onEditLoad(liveItem);
    }
  };

  // ── Weekly chart is now rendered by the shared WeeklySalesChart
  // component (identical to the Driver Details chart). Week navigation,
  // earliest-week gating, and RTL data ordering all live inside that
  // shared component now — no local chart state here.

  return (
    <motion.div
      key="stats-tab"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 pb-8"
    >
      {/* ── Week / day selector (Statistics tab only, per spec) ── */}
      <WeekDaySelector
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        earliestDate={earliestSnapshotDate}
      />

      {/* ── Cargo (Current / Remaining) ── */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06]">
        <SectionTitle icon={Package} title={cargoTitle} />

        {displayCargo.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2 text-center">
            {isLiveDay ? 'لا توجد حمولة حالياً' : 'لا توجد بيانات لهذا اليوم'}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {displayCargo.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between bg-muted/50 rounded-xl px-3 py-2.5 gap-4"
              >
                {/* Pencil — visible on BOTH live and historical days.
                    On historical days, tapping it promotes the snapshot to
                    live Current Cargo before opening the editor. */}
                <button
                  onClick={() =>
                    isLiveDay ? onEditLoad(item) : void handleEditFromHistory(item)
                  }
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-primary hover:bg-primary/10 transition-colors shrink-0"
                  data-testid={`btn-edit-load-${item.id}`}
                  aria-label={isLiveDay ? 'تعديل المنتج' : 'تعديل وتحويل إلى حمولة حالية'}
                >
                  <Pencil size={14} />
                </button>
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

      {/* ── Sales for the selected day ── */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06]">
        <SectionTitle icon={ShoppingCart} title="سجل المبيعات" />
        {daySales.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2 text-center">
            {isLiveDay ? 'لا توجد مبيعات بعد' : 'لا توجد مبيعات في هذا اليوم'}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {daySales.map((sale) => (
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

      {/* ── Weekly chart (shared component — identical to Driver Details chart) ── */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06]">
        <SectionTitle icon={ShoppingCart} title="مبيعات هذا الأسبوع" />
        <WeeklySalesChart sales={sales} driverId={driverId} />
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
