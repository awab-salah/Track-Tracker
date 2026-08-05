import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Users, Search } from 'lucide-react';
import { useLocation } from 'wouter';
import { useApp } from '@/store/AppContext';
import { DriverCard } from './DriverCard';

export function DriversTab() {
  const [, setLocation] = useLocation();
  const { drivers } = useApp();
  const [search, setSearch] = useState('');

  const filteredDrivers = useMemo(() => {
    if (!search.trim()) return drivers;
    const q = search.trim().toLowerCase();
    return drivers.filter((d) => d.name.toLowerCase().includes(q));
  }, [drivers, search]);

  return (
    <div
      key="drivers"
      className="flex-1 overflow-y-auto"
    >
      {drivers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Users size={28} className="text-muted-foreground/50" />
          </div>
          <p className="text-muted-foreground text-sm font-medium">لا يوجد سواق مسجلون بعد</p>
          <p className="text-muted-foreground/60 text-xs text-center px-8">
            شارك رمز الانضمام مع السواق ليتمكنوا من الانضمام
          </p>
        </div>
      ) : (
        <div className="p-4 flex flex-col gap-3 pb-6">
          {/* ── Search bar ── */}
          <div className="relative">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث عن سائق…"
              className="w-full pr-9 pl-3 py-2.5 text-sm rounded-lg border border-border bg-muted/30 placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
              dir="rtl"
            />
          </div>

          <p className="text-xs text-muted-foreground font-semibold px-1 mb-1">
            {filteredDrivers.length === drivers.length
              ? `${drivers.length} سائق نشط`
              : `${filteredDrivers.length} من ${drivers.length} سائق`}
          </p>
          {filteredDrivers.map((driver, i) => (
            // No y-transform on individual items — avoids GPU compositing seams during scroll.
            // The parent motion.div already provides the entrance animation.
            <motion.div
              key={driver.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.06, duration: 0.2 }}
            >
              <DriverCard
                driver={driver}
                onClick={() => setLocation(`/driver/${driver.id}`)}
              />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
