import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useState } from 'react';

/**
 * PWAInstallBanner — shows a persistent install prompt when the
 * browser supports PWA installation. The user can install or dismiss.
 *
 * Dismissed state is stored in sessionStorage so it doesn't reappear
 * in the same session.
 */
export function PWAInstallBanner() {
  const { canInstall, promptInstall, isInstalled } = usePWAInstall();
  const [dismissed, setDismissed] = useState(() => {
    return sessionStorage.getItem('pwa-install-dismissed') === 'true';
  });

  if (isInstalled || !canInstall || dismissed) return null;

  const handleInstall = async () => {
    const accepted = await promptInstall();
    if (accepted) {
      setDismissed(true);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('pwa-install-dismissed', 'true');
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 250, damping: 25 }}
        className="fixed bottom-4 left-4 right-4 z-[9998] max-w-md mx-auto
                   rounded-2xl shadow-2xl border border-white/10 p-4"
        style={{
          background: 'linear-gradient(135deg, #104C64 0%, #0D3B4A 100%)',
          direction: 'rtl',
        }}
      >
        <button
          onClick={handleDismiss}
          className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center
                     justify-center text-white/50 hover:text-white hover:bg-white/10
                     transition-colors"
          aria-label="إغلاق"
        >
          <X size={14} />
        </button>

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
            <Smartphone size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold">تثبيت TrackTracker</p>
            <p className="text-white/70 text-xs mt-0.5">
              أضف التطبيق إلى شاشتك الرئيسية للوصول السريع والعمل بدون إنترنت
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3 mr-[52px]">
          <button
            onClick={handleInstall}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold
                       bg-white text-[#104C64] hover:bg-white/90
                       transition-colors active:scale-95"
          >
            <Download size={14} />
            تثبيت
          </button>
          <button
            onClick={handleDismiss}
            className="px-3 py-2 rounded-lg text-sm text-white/60 hover:text-white
                       hover:bg-white/10 transition-colors"
          >
            لاحقاً
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
