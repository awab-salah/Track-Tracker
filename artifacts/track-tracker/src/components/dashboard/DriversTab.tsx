import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { useLocation } from 'wouter';
import { useApp } from '@/store/AppContext';
import { DriverCard } from './DriverCard';

export function DriversTab() {
  const [, setLocation] = useLocation();
  const { drivers } = useApp();

  return (
    // Opacity-only entrance (no `y` transform): animating a transform on this
    // container promotes it (and every descendant, including the Arabic
    // driver name/vehicle/location text below) to its own GPU-composited
    // layer for the duration of the animation. Combined with `overflow-hidden`
    // clipping on the RTL/shaped Arabic glyphs inside DriverCard, that
    // compositing pass is what produced the corrupted horizontal-line
    // rendering artifact — the fix is to stop transform-animating a container
    // that holds shaped Arabic text, not to hide the symptom with CSS.
    <motion.div
      key="drivers"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
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
          <p className="text-xs text-muted-foreground font-semibold px-1 mb-1">
            {drivers.length} سائق نشط
          </p>
          {drivers.map((driver, i) => (
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
    </motion.div>
  );
}
