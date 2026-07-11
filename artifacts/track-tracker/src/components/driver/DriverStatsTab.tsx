import { useState } from 'react';
import { motion } from 'framer-motion';
import { Package, ShoppingCart, Receipt, Pencil } from 'lucide-react';
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
  formatIQD,
  pluralizeUnit,
  type CargoItem,
} from '@/data/mockData';

const SHORT_DAY: Record<string, string> = {
  'الأحد': 'أحد', 'الاثنين': 'اثنين', 'الثلاثاء': 'ثلاثاء',
  'الأربعاء': 'أربع', 'الخميس': 'خميس', 'الجمعة': 'جمعة', 'السبت': 'سبت',
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

  const driverId = currentDriver?.id ?? '';
  const cargo = getDriverCargo(loads, driverId);
  const driverSales = getDriverSales(sales, driverId);
  const performance = getWeeklyPerformance(sales, driverId);

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
        {cargo.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2 text-center">لا توجد حمولة حالياً</p>
        ) : (
          <div className="flex flex-col gap-2">
            {cargo.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between bg-muted/50 rounded-xl px-3 py-2.5 gap-4"
              >
                <button
                  onClick={() => onEditLoad(item)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-primary hover:bg-primary/10 transition-colors shrink-0"
                  data-testid={`btn-edit-load-${item.id}`}
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
        <p className="text-xs text-muted-foreground mb-4">بالدينار العراقي</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={performance} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <XAxis
              dataKey="day"
              tickFormatter={(v) => SHORT_DAY[v] ?? v}
              tick={{ fontFamily: 'Cairo', fontSize: 11, fill: '#888' }}
              axisLine={false}
              tickLine={false}
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
              {performance.map((_, i) => (
                <Cell
                  key={i}
                  fill={i === performance.length - 1 ? '#C97A56' : '#0D4D5A'}
                  fillOpacity={i === performance.length - 1 ? 1 : 0.85}
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
