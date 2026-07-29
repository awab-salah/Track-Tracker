import { useState, useEffect, useCallback } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * PWAUpdateBanner — shown when the service worker detects a new version.
 * Uses vite-plugin-pwa's `registerType: 'prompt'` mode.
 *
 * The user can:
 *   - Click "تحديث" to reload and activate the new version
 *   - Click ✕ to dismiss (the banner will reappear on next visit)
 */
export function PWAUpdateBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      // Check for updates every 30 minutes
      if (registration) {
        setInterval(() => {
          registration.update();
        }, 30 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('[PWA] SW registration error:', error);
    },
  });

  useEffect(() => {
    if (needRefresh) {
      setShowBanner(true);
    }
  }, [needRefresh]);

  useEffect(() => {
    // Show a brief toast when the app is ready for offline use
    if (offlineReady) {
      console.log('[PWA] App is ready for offline use');
    }
  }, [offlineReady]);

  const handleUpdate = useCallback(async () => {
    await updateServiceWorker(true);
  }, [updateServiceWorker]);

  const handleDismiss = useCallback(() => {
    setShowBanner(false);
  }, []);

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between
                     px-4 py-3 shadow-lg"
          style={{
            background: 'linear-gradient(135deg, #104C64 0%, #0D3B4A 100%)',
            direction: 'rtl',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <RefreshCw size={16} className="text-white" />
            </div>
            <div>
              <p className="text-white text-sm font-semibold">تحديث متاح</p>
              <p className="text-white/70 text-xs">إصدار جديد من TrackTracker متاح</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleUpdate}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold
                         bg-white text-[#104C64] hover:bg-white/90
                         transition-colors active:scale-95"
            >
              تحديث
            </button>
            <button
              onClick={handleDismiss}
              className="w-7 h-7 rounded-full flex items-center justify-center
                         text-white/60 hover:text-white hover:bg-white/10
                         transition-colors"
              aria-label="إغلاق"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
