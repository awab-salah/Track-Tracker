import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, Receipt } from 'lucide-react';
import { ReceiptViewerModal } from '@/components/ReceiptViewerModal';
import { WeekDaySelector } from '@/components/WeekDaySelector';
import { CargoCard } from '@/components/CargoCard';
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
import { useCargoHistory } from '@/hooks/useCargoHistory';

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
  const { currentDriver, loads, sales, promoteSnapshotToLive, cargoEditedToday } = useApp();
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  // ── Day-based cargo/sales view + midnight carry-over ──
  // Shared with the Company Dashboard's Driver Details page — both pages
  // now use the EXACT same `useCargoHistory` hook for snapshot fetching,
  // carry-over detection, displayCargo derivation, and cargo title
  // resolution. Do NOT duplicate this logic; add new callers to
  // `useCargoHistory` instead.
  //
  // Midnight (12:00 AM) title rules are implemented inside the shared
  // hook + `lib/cargoCarryOver`:
  //
  //   TODAY, carried-over from yesterday (driver has NOT edited cargo yet):
  //     → "الحمولة المتبقية من اليوم السابق"
  //   TODAY, after driver edits/adds cargo:
  //     → "الحمولة الحالية"
  //   TODAY, when yesterday's snapshot had ZERO remaining cargo:
  //     → "الحمولة الحالية" (default state, no carry-over)
  //   YESTERDAY or ANY OLDER past day:
  //     → "الحمولة المتبقية من هذا اليوم" (immutable snapshot)
  //   FUTURE day:
  //     → "الحمولة الحالية" (live loads, empty)
  const driverId = currentDriver?.id ?? '';
  const cargo = getDriverCargo(loads, driverId);
  const {
    today,
    selectedDate,
    setSelectedDate,
    earliestSnapshotDate,
    minDate,
    maxDate,
    isLiveDay,
    isFuture,
    displayCargo,
    cargoTitle,
  } = useCargoHistory(driverId, cargo, currentDriver?.createdAt, cargoEditedToday);

  const driverSales = getDriverSales(sales, driverId);
  // Sales follow the selected day.
  const daySales = driverSales.filter((s) => s.date === selectedDate);

  /**
   * Handle a pencil tap on a HISTORICAL cargo item. Per spec, editing any
   * product from "Remaining Cargo From This Day" immediately promotes that
   * day's snapshot to live Current Cargo. We then snap selectedDate to today
   * (the historical day is now live) and open the Load tab with the matching
   * (now-live) item prefilled.
   *
   * This is the ONLY mutation path on this tab. After the promotion, the
   * shared `useCargoHistory` hook re-evaluates `cargoTitle` for today — and
   * since live loads now differ from yesterday's snapshot (a product was
   * either added, removed, repriced, or its quantity increased), the title
   * immediately switches from "الحمولة المتبقية من اليوم السابق" back to
   * "الحمولة الحالية" (spec D: editing cargo after midnight switches the
   * title back).
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

  /**
   * Edit handler passed to the shared `CargoCard`. Behavior depends on the
   * selected day:
   *
   *   - TODAY (live):           open the Load tab editor with this item.
   *   - PAST day (snapshot):    promote that day's snapshot to live Current
   *                             Cargo (per spec — historical edits convert
   *                             to live), then open the editor.
   *   - FUTURE day:             no-op. Future days have empty cargo per
   *                             spec, so this branch is unreachable in
   *                             practice (no items to tap). Guarded anyway
   *                             for safety.
   *
   * The shared `CargoCard` is the same component used by the Company
   * Dashboard's Driver Details page — only this call site passes a real
   * `onEditItem`, so the pencil buttons render here and are omitted there.
   */
  const handleEditItem = (item: CargoItem) => {
    if (isFuture) return; // future days have no editable cargo
    if (isLiveDay) {
      onEditLoad(item);
    } else {
      void handleEditFromHistory(item);
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
      {/* ── Week / day selector (Statistics tab only, per spec) ──
          Navigation bounds (per spec):
            - First available week = account-creation week (minDate).
            - Last available week  = current week (maxDate = today).
            - Prev/Next arrows enable/disable correctly.
            - Day cells outside [minDate, maxDate] render disabled.
            - No fake empty weeks. */}
      <WeekDaySelector
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        earliestDate={earliestSnapshotDate}
        minDate={minDate}
        maxDate={maxDate}
      />

      {/* ── Cargo (Current / Remaining) ──
          Shared CargoCard component — IDENTICAL to the one rendered in
          the Company Dashboard's Driver Details page (same styling,
          animations, labels, colors, behavior). This call site passes
          a real `onEditItem` so each row renders a pencil button; the
          Company Dashboard view omits it (read-only).

          For FUTURE days, `displayCargo` is empty per spec (future days
          never inherit inventory); the card shows the empty-state
          message and the title resolves to "الحمولة الحالية".

          `isLiveDay` for the CargoCard means "show the live empty-state
          message" (today OR future), as opposed to the snapshot
          empty-state message used for past days. The actual edit
          handler is a no-op for future days (no items to tap). */}
      <CargoCard
        title={cargoTitle}
        items={displayCargo}
        isLiveDay={isLiveDay || isFuture}
        onEditItem={handleEditItem}
        editAriaLabel={(item) =>
          isLiveDay ? 'تعديل المنتج' : 'تعديل وتحويل إلى حمولة حالية'
        }
      />

      {/* ── Sales for the selected day ── */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06]">
        <SectionTitle icon={ShoppingCart} title="سجل المبيعات" />
        {daySales.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2 text-center">
            {(isLiveDay || isFuture) ? 'لا توجد مبيعات بعد' : 'لا توجد مبيعات في هذا اليوم'}
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
