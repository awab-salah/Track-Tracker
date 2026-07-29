import { usePWAUpdate } from '@/hooks/usePWAUpdate';

/**
 * Floating snackbar that appears when a new service-worker version
 * is available.  Pressing "تحديث" (Update) tells the SW to skipWaiting
 * and then reloads the page automatically.
 */
export default function PWAUpdateBanner() {
  const { updateAvailable, applyUpdate } = usePWAUpdate();

  if (!updateAvailable) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-[9999] flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary px-4 py-3 text-primary-foreground shadow-lg md:left-auto md:right-4 md:w-auto md:max-w-sm"
      role="alert"
      dir="rtl"
    >
      <span className="text-sm font-medium">
        تحديث جديد متاح
      </span>
      <button
        onClick={applyUpdate}
        className="shrink-0 rounded-md bg-white/20 px-3 py-1.5 text-sm font-bold hover:bg-white/30 transition-colors"
      >
        تحديث
      </button>
    </div>
  );
}
