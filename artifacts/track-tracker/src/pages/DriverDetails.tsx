import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { ArrowRight, MapPin, Car, ShoppingCart, Receipt } from 'lucide-react';
import { motion } from 'framer-motion';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MobileLayout } from '@/layouts/MobileLayout';
import { InfoRow } from '@/components/InfoRow';
import { ReceiptViewerModal } from '@/components/ReceiptViewerModal';
import { WeekDaySelector } from '@/components/WeekDaySelector';
import { WeeklySalesChart } from '@/components/driver/WeeklySalesChart';
import { CargoCard } from '@/components/CargoCard';
import {
  getDriverCargo,
  getDriverSales,
  formatIQD,
} from '@/data/mockData';
import { useApp } from '@/store/AppContext';
import { useResolvedLocation } from '@/hooks/useResolvedLocation';
import { useCargoHistory } from '@/hooks/useCargoHistory';

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

  // ── Resolved location text ──
  // Shared hook: detects "lat, lng" pattern and reverse-geocodes via the
  // cached/throttled `reverseGeocode` service. Already-readable strings
  // pass through unchanged. Per spec: do NOT change how the location is
  // stored. The same hook is reused by DriverCard in the Drivers tab —
  // do NOT duplicate this logic.
  //
  // NOTE: `useResolvedLocation` is called UNCONDITIONALLY before the
  // early-return guard below to respect React's rules of hooks. The
  // hook itself handles the `undefined` case (no driver).
  const driverIdParam = params.id;
  const driver = drivers.find((d) => d.id === driverIdParam);
  const resolvedLocation = useResolvedLocation(driver?.location);

  // ── Day-based cargo view + midnight carry-over ──
  // Shared with the Driver Dashboard's Statistics tab — both pages now
  // use the EXACT same `useCargoHistory` hook for snapshot fetching,
  // carry-over detection, displayCargo derivation, and cargo title
  // resolution. Do NOT duplicate this logic; add new callers to
  // `useCargoHistory` instead.
  //
  // Called with the resolved driverId (may be empty string when the
  // driver is missing — the hook is a no-op in that case).
  const driverId = driver?.id ?? '';
  const cargo = getDriverCargo(loads, driverId);
  const {
    selectedDate,
    setSelectedDate,
    earliestSnapshotDate,
    isLiveDay,
    displayCargo,
    cargoTitle,
  } = useCargoHistory(driverId, cargo);

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

          {/* ── Section 2: Cargo ──
              Shared CargoCard component — IDENTICAL to the one rendered
              in the Driver Statistics tab (same styling, animations,
              labels, colors, behavior). This call site passes no
              `onEditItem`, so the pencil buttons are omitted (read-only
              view from the Company Dashboard). */}
          <CargoCard
            title={cargoTitle}
            items={displayCargo}
            isLiveDay={isLiveDay}
            motionDelay={0.05}
          />

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
                hint="(استخدم اصبعين لتكبير وتصغير الخريطة)"
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
