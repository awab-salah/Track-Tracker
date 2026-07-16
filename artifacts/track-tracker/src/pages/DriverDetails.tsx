import { useState, useMemo, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { ArrowRight, MapPin, Car, Package, ShoppingCart, Receipt } from 'lucide-react';
import { motion } from 'framer-motion';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MobileLayout } from '@/layouts/MobileLayout';
import { InfoRow } from '@/components/InfoRow';
import { ReceiptViewerModal } from '@/components/ReceiptViewerModal';
import { WeekDaySelector } from '@/components/WeekDaySelector';
import { WeeklySalesChart } from '@/components/driver/WeeklySalesChart';
import {
  getDriverCargo,
  getDriverSales,
  formatIQD,
} from '@/data/mockData';
import { useApp } from '@/store/AppContext';
import { fetchDailySnapshots, fetchEarliestSnapshotDate } from '@/services/loadRepository';
import { reverseGeocode } from '@/services/geocode';
import type { CargoItem } from '@/data/mockData';

const BAGHDAD_TZ = 'Asia/Baghdad';

/** Returns YYYY-MM-DD for today in Baghdad local time. */
function baghdadToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BAGHDAD_TZ });
}

/**
 * Add `offset` days to a YYYY-MM-DD string, returning a new YYYY-MM-DD.
 * Arithmetic is done in UTC to avoid local-timezone drift. (Local helper —
 * do not change repository APIs per spec.)
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

// Fix leaflet icons (same fix as MapTab)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
});

function makeSingleMarker(initial: string) {
  return L.divIcon({
    html: `<div style="
      width:40px;height:40px;border-radius:50%;
      background:#0D4D5A;border:3px solid #fff;
      box-shadow:0 3px 10px rgba(13,77,90,0.4);
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-size:16px;font-weight:800;
      font-family:Cairo,sans-serif;
    ">${initial}</div>`,
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function SectionTitle({ icon: Icon, title, hint }: { icon: React.ElementType; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={16} className="text-primary shrink-0" />
      <h3 className="font-extrabold text-[15px] text-foreground">{title}</h3>
      {hint && (
        <span className="text-[10px] text-muted-foreground/80 font-normal leading-tight">
          {hint}
        </span>
      )}
    </div>
  );
}

export default function DriverDetails() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const { drivers, loads, sales } = useApp();
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const driver = drivers.find((d) => d.id === params.id);

  // ── Day-based cargo/sales view ──
  // selectedDate: YYYY-MM-DD. Defaults to today (Baghdad).
  //
  // Title rules (UI only — snapshot generation/storage untouched):
  //   TODAY      → "الحمولة الحالية"
  //   YESTERDAY  → "الحمولة المتبقية من اليوم السابق"
  //   ANY OLDER  → "الحمولة المتبقية من هذا اليوم"
  //   FUTURE     → "الحمولة الحالية" (live, empty)
  const today = useMemo(() => baghdadToday(), []);
  const yesterday = useMemo(() => addDays(today, -1), [today]);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const isToday = selectedDate === today;
  const isYesterday = selectedDate === yesterday;
  const isLiveDay = selectedDate >= today; // today or future -> live loads

  const [historyCargo, setHistoryCargo] = useState<CargoItem[] | null>(null);
  const [earliestSnapshotDate, setEarliestSnapshotDate] = useState<string | null>(null);

  // ── Resolved location text ──
  // driver.location may be a raw "${lat}, ${lng}" string written by the
  // driver's useLocationTracking hook. We reverse-geocode those coords into
  // a human-readable Arabic city/region label for display. If driver.location
  // already looks like a city name (no commas that look like coordinates),
  // we just use it as-is. Per spec: do NOT change how the location is stored.
  const [resolvedLocation, setResolvedLocation] = useState<string | null>(null);

  useEffect(() => {
    if (!driver) return;
    let cancelled = false;
    const raw = driver.location?.trim() ?? '';
    // Detect "lat, lng" pattern: two numbers separated by a comma.
    const coordMatch = raw.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (!coordMatch) {
      // Already a city name — use as-is.
      setResolvedLocation(raw || '—');
      return;
    }
    const lat = Number(coordMatch[1]);
    const lng = Number(coordMatch[2]);
    void reverseGeocode(lat, lng).then((label) => {
      if (!cancelled) setResolvedLocation(label);
    });
    return () => { cancelled = true; };
  }, [driver]);

  useEffect(() => {
    if (!driver) return;
    let cancelled = false;
    void fetchEarliestSnapshotDate(driver.id).then((d) => {
      if (!cancelled) setEarliestSnapshotDate(d);
    });
    return () => { cancelled = true; };
  }, [driver]);

  useEffect(() => {
    if (!driver || isLiveDay) {
      setHistoryCargo(null);
      return;
    }
    let cancelled = false;
    void fetchDailySnapshots([driver.id], selectedDate).then((rows) => {
      if (!cancelled) setHistoryCargo(rows);
    });
    return () => { cancelled = true; };
  }, [driver, selectedDate, isLiveDay]);

  if (!driver) {
    return (
      <MobileLayout>
        <div className="flex flex-col items-center justify-center flex-1 gap-4 p-6">
          <p className="text-muted-foreground font-medium">السائق غير موجود</p>
          <button
            onClick={() => setLocation('/owner-dashboard')}
            className="text-primary font-bold text-sm"
          >
            العودة للقائمة
          </button>
        </div>
      </MobileLayout>
    );
  }

  const cargo = getDriverCargo(loads, driver.id);
  // Plain derivations (no useMemo) — these run after the early-return guard
  // above, so they cannot be hooks.
  // Per spec: hide qty-0 products from the UI for BOTH live and snapshot cargo.
  // Underlying rows in the loads table and JSONB snapshots are untouched.
  const displayCargo = (isLiveDay ? cargo : (historyCargo ?? [])).filter(
    (item) => item.quantity > 0,
  );
  const cargoTitle = isToday
    ? 'الحمولة الحالية'
    : isYesterday
      ? 'الحمولة المتبقية من اليوم السابق'
      : isLiveDay
        ? 'الحمولة الحالية'
        : 'الحمولة المتبقية من هذا اليوم';

  const driverSales = getDriverSales(sales, driver.id);
  const daySales = driverSales.filter((s) => s.date === selectedDate);
  const dayTotalSales = daySales.reduce((sum, s) => sum + s.totalPrice, 0);

  return (
    <MobileLayout>
      <div className="flex flex-col flex-1 h-[100dvh]">

        {/* ── Header ── */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-background shrink-0">
          <button
            onClick={() => setLocation('/owner-dashboard')}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            data-testid="btn-back"
          >
            <ArrowRight size={22} className="text-foreground" />
          </button>
          <span className="font-bold text-base text-foreground truncate max-w-[180px]">
            {driver.name}
          </span>
          <div className="w-10" aria-hidden />
        </header>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5 pb-8">

          {/* ── Section 1: Driver info ── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.0 }}
            className="bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06]"
          >
            <SectionTitle icon={Car} title="معلومات السائق" />
            <div className="flex flex-col gap-2">
              <InfoRow label="الاسم" value={driver.name} />
              <InfoRow label="رقم السيارة" value={driver.vehicleNumber} />
              <InfoRow
                label="الموقع"
                value={resolvedLocation ?? driver.location}
                accent
              />
            </div>
          </motion.div>

          {/* ── Day selector (below Driver Information, above Cargo/Sales) ── */}
          <WeekDaySelector
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            earliestDate={earliestSnapshotDate}
          />

          {/* ── Section 2: Cargo ── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06]"
          >
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
                    className="flex items-center justify-between bg-muted/50 rounded-xl px-3 py-2.5"
                  >
                    <div className="text-left">
                      <p className="text-xs text-muted-foreground">السعر / وحدة</p>
                      <p className="text-sm font-bold text-foreground">{formatIQD(item.unitPrice)}</p>
                    </div>
                    <div className="flex items-center gap-2 text-right">
                      <div>
                        <p className="text-[13px] font-bold text-foreground">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">{item.quantity} وحدة</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* ── Section 3: Sales (for the selected day) ── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06]"
          >
            <SectionTitle icon={ShoppingCart} title="المبيعات" />
            {daySales.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 text-center">
                {isLiveDay ? 'لا توجد مبيعات بعد' : 'لا توجد مبيعات في هذا اليوم'}
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-2 mb-3">
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
                              <p className="text-xs text-muted-foreground">{line.quantity} وحدة</p>
                            </div>
                          ))}
                        </div>
                      </div>
                      {sale.receiptImageUrl && (
                        <button
                          onClick={() => setReceiptUrl(sale.receiptImageUrl!)}
                          className="self-start flex items-center gap-1.5 text-xs font-bold text-primary
                                     hover:text-primary/80 transition-colors"
                          data-testid={`btn-view-receipt-${sale.id}`}
                        >
                          <Receipt size={13} />
                          عرض الإيصال
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Total for the selected day */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <motion.span
                    initial={{ scale: 0.9 }}
                    animate={{ scale: 1 }}
                    className="text-lg font-extrabold"
                    style={{ color: '#C97A56' }}
                  >
                    {formatIQD(dayTotalSales)}
                  </motion.span>
                  <span className="text-sm font-bold text-foreground">إجمالي مبيعات اليوم</span>
                </div>
              </>
            )}
          </motion.div>

          {/* ── Section 4: Location map ── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06]"
          >
            <div className="p-4 pb-3">
              <SectionTitle
                icon={MapPin}
                title="موقع السائق"
                hint="(استخدم اصبعين لتحريك الخريطة)"
              />
            </div>
            <div style={{ height: 220 }}>
              <MapContainer
                center={[driver.lat, driver.lng]}
                zoom={10}
                style={{ width: '100%', height: '100%' }}
                zoomControl={false}
                dragging={true}
                scrollWheelZoom={false}
              >
                <TileLayer
                  attribution='&copy; OpenStreetMap'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker
                  position={[driver.lat, driver.lng]}
                  icon={makeSingleMarker(driver.name.charAt(0))}
                />
              </MapContainer>
            </div>
          </motion.div>

          {/* ── Section 5: Performance chart (shared component — identical to
              the Statistics tab chart: same colors, axes, ticks, tooltip,
              week navigation, RTL ordering, and animations). ── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06]"
          >
            <SectionTitle icon={BarChart2Icon} title="أداء السائق الأسبوعي" />
            <WeeklySalesChart sales={sales} driverId={driver.id} />
          </motion.div>

        </div>
      </div>

      <ReceiptViewerModal imageUrl={receiptUrl} onClose={() => setReceiptUrl(null)} />
    </MobileLayout>
  );
}

// Inline icon component to avoid re-import
function BarChart2Icon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}
