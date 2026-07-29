import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Wifi } from 'lucide-react';

/**
 * OfflineIndicator — shows a non-intrusive banner when the user
 * goes offline, and briefly confirms when they're back online.
 */
export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showBackOnline, setShowBackOnline] = useState(false);

  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true);
      setShowBackOnline(false);
    };

    const handleOnline = () => {
      setIsOffline(false);
      setShowBackOnline(true);
      // Auto-hide "back online" after 3 seconds
      setTimeout(() => setShowBackOnline(false), 3000);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className="fixed bottom-0 left-0 right-0 z-[9997] flex items-center justify-center
                     gap-2 py-2 bg-amber-600 text-white text-xs font-medium"
          style={{ direction: 'rtl' }}
        >
          <WifiOff size={14} />
          <span>لا يوجد اتصال بالإنترنت — بعض الميزات قد لا تعمل</span>
        </motion.div>
      )}
      {showBackOnline && !isOffline && (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          className="fixed bottom-0 left-0 right-0 z-[9997] flex items-center justify-center
                     gap-2 py-2 bg-emerald-600 text-white text-xs font-medium"
          style={{ direction: 'rtl' }}
        >
          <Wifi size={14} />
          <span>تم استعادة الاتصال</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
