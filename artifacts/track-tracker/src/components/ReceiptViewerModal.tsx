import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Shared receipt image lightbox, reused by the Driver Statistics sales
 * history and the Company Driver Details sales list, so "View Receipt"
 * behaves identically everywhere.
 */
export function ReceiptViewerModal({
  imageUrl,
  onClose,
}: {
  imageUrl: string | null;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {imageUrl && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/70 z-40"
            onClick={onClose}
          />
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed inset-x-6 top-1/2 -translate-y-1/2 z-50 max-w-[380px] mx-auto"
          >
            <div className="bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="font-bold text-sm text-foreground">صورة الإيصال</span>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  data-testid="btn-close-receipt"
                >
                  <X size={18} className="text-foreground" />
                </button>
              </div>
              <img src={imageUrl} alt="الإيصال" className="w-full max-h-[60vh] object-contain bg-muted" />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
