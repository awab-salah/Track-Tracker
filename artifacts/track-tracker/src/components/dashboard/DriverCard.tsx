import { motion } from 'framer-motion';
import { MapPin, Car } from 'lucide-react';
import type { Driver } from '@/data/mockData';
import { useResolvedLocation } from '@/hooks/useResolvedLocation';

interface DriverCardProps {
  driver: Driver;
  onClick: () => void;
}

export function DriverCard({ driver, onClick }: DriverCardProps) {
  // Reuse the same reverse-geocoding logic as Driver Details so the card
  // shows a human-readable Arabic city/region label (e.g. "الأنبار، هيت")
  // instead of raw GPS coordinates. Falls back to the raw string while the
  // geocode request is in flight. Do NOT duplicate this logic — see
  // `useResolvedLocation`.
  const resolvedLocation = useResolvedLocation(driver.location);

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="w-full text-right bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06] flex items-center gap-4 transition-colors active:bg-gray-50 dark:active:bg-zinc-800"
    >
      {/* Avatar */}
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-extrabold text-lg">
        {driver.name.charAt(0)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 text-right">
        <p className="font-bold text-foreground text-[15px] truncate">{driver.name}</p>
        <div className="flex items-center gap-1 mt-[3px]">
          <Car size={13} className="text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground truncate">{driver.vehicleNumber}</span>
        </div>
        <div className="flex items-center gap-1 mt-[2px]">
          <MapPin size={13} className="shrink-0" style={{ color: '#C97A56' }} />
          <span className="text-sm font-semibold truncate" style={{ color: '#C97A56' }}>
            {resolvedLocation ?? driver.location}
          </span>
        </div>
      </div>

      {/* Chevron (RTL → points left = go deeper) */}
      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M7 2L3 6L7 10"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted-foreground"
          />
        </svg>
      </div>
    </motion.button>
  );
}
