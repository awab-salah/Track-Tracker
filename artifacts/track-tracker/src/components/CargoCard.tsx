import { motion } from 'framer-motion';
import { Package, Pencil } from 'lucide-react';
import { formatIQD, pluralizeUnit, type CargoItem } from '@/data/mockData';

/**
 * Shared cargo card — the exact same cargo display used by:
 *
 *   - the Company Dashboard's Driver Details page
 *     (`src/pages/DriverDetails.tsx`)
 *   - the Driver Dashboard's Statistics tab
 *     (`src/components/driver/DriverStatsTab.tsx`)
 *
 * Renders:
 *   1. a card header (Package icon + `title`)
 *   2. either an empty-state message, OR a vertical list of cargo rows
 *
 * Each cargo row is identical across both call sites: same layout, same
 * colors, same animations, same `pluralizeUnit` labels. The Company
 * Dashboard view passes `onEditItem = undefined` so no pencil appears;
 * the Driver Statistics view passes a real callback that opens the
 * Load editor (and may promote a historical snapshot to live first).
 *
 * Do NOT duplicate this UI — add new callers here.
 */

export interface CargoCardProps {
  /** Resolved cargo card title (midnight carry-over aware). */
  title: string;
  /** Cargo rows to display (already filtered to qty > 0). */
  items: CargoItem[];
  /** True iff viewing today or a future day (controls empty-state text). */
  isLiveDay: boolean;
  /**
   * Optional edit handler. When provided, each row renders a pencil
   * button on the visual left that calls this with the matching item.
   * The Driver Statistics view uses this; the Company Dashboard view
   * omits it (read-only).
   */
  onEditItem?: (item: CargoItem) => void;
  /**
   * Optional aria-label override for the pencil button. The Statistics
   * tab supplies a context-aware label depending on whether the day is
   * live or historical (the historical case promotes the snapshot to
   * live Current Cargo first).
   */
  editAriaLabel?: (item: CargoItem) => string;
  /** Test-id prefix for edit buttons. Defaults to `btn-edit-load`. */
  editTestPrefix?: string;
  /** Optional framer-motion entrance delay (seconds). Defaults to 0.05. */
  motionDelay?: number;
}

export function CargoCard({
  title,
  items,
  isLiveDay,
  onEditItem,
  editAriaLabel,
  editTestPrefix = 'btn-edit-load',
  motionDelay = 0.05,
}: CargoCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: motionDelay }}
      className="bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06]"
    >
      <div className="flex items-center gap-2 mb-3">
        <Package size={16} className="text-primary shrink-0" />
        <h3 className="font-extrabold text-[15px] text-foreground">{title}</h3>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 text-center">
          {isLiveDay ? 'لا توجد حمولة حالياً' : 'لا توجد بيانات لهذا اليوم'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between bg-muted/50 rounded-xl px-3 py-2.5 gap-4"
            >
              {onEditItem && (
                <button
                  onClick={() => onEditItem(item)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-primary hover:bg-primary/10 transition-colors shrink-0"
                  data-testid={`${editTestPrefix}-${item.id}`}
                  aria-label={editAriaLabel ? editAriaLabel(item) : 'تعديل المنتج'}
                >
                  <Pencil size={14} />
                </button>
              )}
              <div className="flex flex-col gap-1 text-left shrink-0">
                <p className="text-xs text-muted-foreground">السعر / وحدة</p>
                <p className="text-sm font-bold text-foreground">{formatIQD(item.unitPrice)}</p>
              </div>
              <div className="flex flex-col gap-1 text-right flex-1">
                <p className="text-[13px] font-bold text-foreground">{item.productName}</p>
                <p className="text-xs text-muted-foreground">
                  {item.quantity} {pluralizeUnit(item.quantity)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
