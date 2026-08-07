import { useState } from 'react';
import { useLocation, Redirect } from 'wouter';
import { MobileLayout } from '@/layouts/MobileLayout';
import { Logo } from '@/components/Logo';
import { SegmentedControl } from '@/components/SegmentedControl';
import { LoadTab } from '@/components/driver/LoadTab';
import { SalesTab } from '@/components/driver/SalesTab';
import { DriverStatsTab } from '@/components/driver/DriverStatsTab';
import { SubscriptionGate } from '@/components/SubscriptionGate';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/store/AuthContext';
import { useLocationTracking } from '@/hooks/useLocationTracking';
import type { CargoItem } from '@/data/mockData';

type TabId = 'load' | 'sales' | 'stats';

// ── State Preservation Strategy ───────────────────────────────────────────────
//
// PREVIOUS DESIGN (BROKEN): Conditional rendering with AnimatePresence:
//   {activeTab === 'sales' && <SalesTab />}
// When switching tabs, the old tab was UNMOUNTED from the React tree,
// destroying ALL its useState state (items, receiptUrl, pickerOpen, etc.).
// When switching back, the tab remounted with default values → data lost.
//
// CURRENT DESIGN (CORRECT): Always-mounted tabs with CSS visibility.
// ALL tabs stay in the React tree permanently (preserving their state).
// Only the active tab is visible (display: flex); inactive tabs are
// hidden with display: none. This means:
//   - Switching tabs preserves all state (no unmount/remount)
//   - Opening camera/file picker doesn't unmount the tab
//   - App backgrounding doesn't unmount the tab
//   - No sessionStorage hacks needed for normal tab switching
//
// sessionStorage for activeTab is still kept as a FALLBACK for the rare
// case of Android Activity recreation (full WebView reload), where React
// state is destroyed regardless because the entire JS context restarts.

const ACTIVE_TAB_KEY = 'tt_driver_active_tab';

function loadActiveTab(): TabId {
  try {
    const saved = sessionStorage.getItem(ACTIVE_TAB_KEY);
    if (saved === 'load' || saved === 'sales' || saved === 'stats') return saved;
  } catch { /* sessionStorage unavailable */ }
  return 'load';
}

function saveActiveTab(tab: TabId): void {
  try {
    sessionStorage.setItem(ACTIVE_TAB_KEY, tab);
  } catch { /* best effort */ }
}

export default function DriverDashboard() {
  const [, setLocation] = useLocation();
  const { currentDriver, currentDriverId, companySubscriptionActive } = useApp();
  const [activeTab, setActiveTabRaw] = useState<TabId>(loadActiveTab);

  console.log(`[DriverDashboard] RENDER — currentDriver=${currentDriver ? currentDriver.name : 'null'}, currentDriverId=${currentDriverId ?? 'null'}`);

  const setActiveTab = (tab: TabId) => {
    setActiveTabRaw(tab);
    saveActiveTab(tab);
  };
  const [editingLoad, setEditingLoad] = useState<CargoItem | null>(null);

  // Auto-starts GPS tracking the moment the dashboard mounts.
  // Hook must be called unconditionally (rules of hooks) — driverId null
  // means the hook is a no-op until currentDriver is available.
  const locationState = useLocationTracking(currentDriverId ?? null);

  // ── Render-loop safety ───────────────────────────────────────────────
  // currentDriver is derived with a synchronous fallback to authDriverProfile
  // in AppContext, so it is NEVER null for a logged-in driver. This guard
  // only triggers if the user is not authenticated as a driver (e.g. stale
  // session after sign-out), in which case redirecting to the auth page is
  // correct.
  if (!currentDriver) {
    return <Redirect to="/driver-auth" />;
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

        {/* ── Content — always-mounted tabs ──
            All three tabs are ALWAYS in the React tree. Only the active
            tab has display:flex; inactive tabs have display:none.
            This preserves all component state across tab switches,
            camera/file-picker opens, and app backgrounding.
            AnimatePresence is intentionally NOT used here because
            its mode="wait" required conditional rendering, which caused
            unmount/remount and destroyed state. */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {!companySubscriptionActive ? (
            <SubscriptionGate variant="driver" />
          ) : (
            <>
              <div
                className="flex-1 flex flex-col min-h-0"
                style={{ display: activeTab === 'load' ? 'flex' : 'none' }}
              >
                <LoadTab
                  editingLoad={editingLoad}
                  onDoneEditing={() => setEditingLoad(null)}
                />
              </div>
              <div
                className="flex-1 flex flex-col min-h-0"
                style={{ display: activeTab === 'sales' ? 'flex' : 'none' }}
              >
                <SalesTab />
              </div>
              <div
                className="flex-1 flex flex-col min-h-0"
                style={{ display: activeTab === 'stats' ? 'flex' : 'none' }}
              >
                <DriverStatsTab
                  onEditLoad={handleEditLoad}
                  locationState={locationState}
                />
              </div>
            </>
          )}
        </div>

      </div>
    </MobileLayout>
  );
}
