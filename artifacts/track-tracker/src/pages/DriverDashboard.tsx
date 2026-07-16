import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { AnimatePresence } from 'framer-motion';
import { MobileLayout } from '@/layouts/MobileLayout';
import { Logo } from '@/components/Logo';
import { SegmentedControl } from '@/components/SegmentedControl';
import { WeekDaySelector } from '@/components/WeekDaySelector';
import { LoadTab } from '@/components/driver/LoadTab';
import { SalesTab } from '@/components/driver/SalesTab';
import { DriverStatsTab } from '@/components/driver/DriverStatsTab';
import { useApp } from '@/store/AppContext';
import { useLocationTracking } from '@/hooks/useLocationTracking';
import { fetchEarliestSnapshotDate } from '@/services/loadRepository';
import type { CargoItem } from '@/data/mockData';

type TabId = 'load' | 'sales' | 'stats';

const BAGHDAD_TZ = 'Asia/Baghdad';

/** Returns YYYY-MM-DD for today in Baghdad local time. */
function baghdadToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BAGHDAD_TZ });
}

export default function DriverDashboard() {
  const [, setLocation] = useLocation();
  const { currentDriver, currentDriverId } = useApp();
  const [activeTab, setActiveTab] = useState<TabId>('load');
  const [editingLoad, setEditingLoad] = useState<CargoItem | null>(null);

  // ── Day-based cargo/sales view ──
  // selectedDate is lifted to the dashboard level so the week selector can
  // sit directly below the top tabs (always visible across Load / Sales /
  // Stats). Only the Cargo card and Sales card on the Stats tab actually
  // respond to it — Load and Sales tabs (the input forms) always work with
  // the current/today cargo.
  const today = useMemo(() => baghdadToday(), []);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [earliestSnapshotDate, setEarliestSnapshotDate] = useState<string | null>(null);

  // Auto-starts GPS tracking the moment the dashboard mounts.
  // Hook must be called unconditionally (rules of hooks) — driverId null
  // means the hook is a no-op until currentDriver is available.
  const locationState = useLocationTracking(currentDriverId ?? null);

  // Fetch earliest snapshot date once per driver (gates the prev-week arrow).
  useEffect(() => {
    if (!currentDriverId) return;
    let cancelled = false;
    void fetchEarliestSnapshotDate(currentDriverId).then((d) => {
      if (!cancelled) setEarliestSnapshotDate(d);
    });
    return () => { cancelled = true; };
  }, [currentDriverId]);

  if (!currentDriver) {
    setLocation('/driver-auth');
    return null;
  }

  const handleEditLoad = (item: CargoItem) => {
    setEditingLoad(item);
    setActiveTab('load');
  };

  return (
    <MobileLayout>
      <div className="flex flex-col h-[100dvh]">

        {/* ── Header — mirrors OwnerDashboard exactly ── */}
        <header
          data-map-header
          className="flex items-center justify-between px-4 py-3 bg-background border-b border-border shrink-0 z-30"
        >
          {/* Profile avatar — right side in RTL (first child) */}
          <button
            onClick={() => setLocation('/driver-profile')}
            className="w-10 h-10 rounded-full overflow-hidden border-2 border-primary/20 bg-primary/10 flex items-center justify-center shrink-0 transition-opacity active:opacity-70"
            data-testid="btn-profile"
          >
            {currentDriver.profilePictureUrl ? (
              <img
                src={currentDriver.profilePictureUrl}
                alt="الصورة الشخصية"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-primary font-extrabold text-base">
                {currentDriver.name.charAt(0)}
              </span>
            )}
          </button>

          {/* Centre: Logo + name */}
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-xl tracking-tight leading-none">
              <span style={{ color: '#0D3B4A' }}>Track</span>
              <span style={{ color: '#C97A56' }}>Tracker</span>
            </span>
            <Logo size="xs" showText={false} />
          </div>

          {/* Spacer to keep centre logo truly centred */}
          <div className="w-10" aria-hidden />
        </header>

        {/* ── Segmented tab control ── */}
        <div className="px-4 pt-3 pb-2 bg-background border-b border-border shrink-0 z-20">
          <SegmentedControl
            options={[
              { label: 'الحمولة', value: 'load' },
              { label: 'المبيعات', value: 'sales' },
              { label: 'الإحصائيات', value: 'stats' },
            ]}
            value={activeTab}
            onChange={(v) => setActiveTab(v as TabId)}
          />
        </div>

        {/* ── Week / day selector — directly below the top tabs ── */}
        <div className="px-4 py-2 bg-background shrink-0 z-10">
          <WeekDaySelector
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            earliestDate={earliestSnapshotDate}
          />
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <AnimatePresence mode="wait">
            {activeTab === 'load' && (
              <LoadTab
                key="load"
                editingLoad={editingLoad}
                onDoneEditing={() => setEditingLoad(null)}
              />
            )}
            {activeTab === 'sales' && <SalesTab key="sales" />}
            {activeTab === 'stats' && (
              <DriverStatsTab
                key="stats"
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                onEditLoad={handleEditLoad}
                locationState={locationState}
              />
            )}
          </AnimatePresence>
        </div>

      </div>
    </MobileLayout>
  );
}
