import { useState } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Map, BarChart2 } from 'lucide-react';
import { MobileLayout } from '@/layouts/MobileLayout';
import { Logo } from '@/components/Logo';
import { DriversTab } from '@/components/dashboard/DriversTab';
import { MapTab } from '@/components/dashboard/MapTab';
import { StatsTab } from '@/components/dashboard/StatsTab';
import { useApp } from '@/store/AppContext';

type TabId = 'drivers' | 'map' | 'stats';

const TABS: { id: TabId; label: string; Icon: React.ElementType }[] = [
  { id: 'drivers', label: 'السواق',     Icon: Users    },
  { id: 'map',     label: 'الخريطة',    Icon: Map      },
  { id: 'stats',   label: 'الإحصائيات', Icon: BarChart2 },
];

export default function OwnerDashboard() {
  const [, setLocation] = useLocation();
  const { company } = useApp();
  const [activeTab, setActiveTab] = useState<TabId>('drivers');

  return (
    <MobileLayout>
      <div className="flex flex-col h-[100dvh]">

        {/* ── Header ── */}
        <header
          data-map-header
          className="flex items-center justify-between px-4 py-3 bg-background border-b border-border shrink-0 z-30"
        >
          {/* Profile avatar — right side in RTL (first child) */}
          <button
            onClick={() => setLocation('/profile')}
            className="w-10 h-10 rounded-full overflow-hidden border-2 border-primary/20 bg-primary/10 flex items-center justify-center shrink-0 transition-opacity active:opacity-70"
            data-testid="btn-profile"
          >
            {company.logoUrl ? (
              <img
                src={company.logoUrl}
                alt="شعار الشركة"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-primary font-extrabold text-base">
                {company.name.charAt(0)}
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

        {/* ── Tab Bar ── */}
        <div
          data-map-tabs
          className="flex bg-background border-b border-border shrink-0 z-20"
        >
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`relative flex-1 flex flex-col items-center py-3 gap-[3px] transition-colors select-none ${
                activeTab === id ? 'text-primary' : 'text-muted-foreground'
              }`}
              data-testid={`tab-${id}`}
            >
              <Icon size={20} strokeWidth={activeTab === id ? 2.2 : 1.8} />
              <span
                className={`text-[11px] font-bold transition-all ${
                  activeTab === id ? 'text-primary' : ''
                }`}
              >
                {label}
              </span>
              {activeTab === id && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 inset-x-4 h-[2.5px] rounded-full bg-primary"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                />
              )}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <AnimatePresence mode="wait">
            {activeTab === 'drivers' && <DriversTab key="drivers" />}
            {activeTab === 'map'     && <MapTab     key="map"     />}
            {activeTab === 'stats'   && <StatsTab   key="stats"   />}
          </AnimatePresence>
        </div>

      </div>
    </MobileLayout>
  );
}
