import { MapPin } from 'lucide-react';

/**
 * Reserved space for the future "Driver Live Location Map" feature.
 * Structural placeholder only — no tracking logic yet.
 */
export function LiveLocationPlaceholder() {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06]">
      <div className="p-4 pb-3 flex items-center gap-2">
        <MapPin size={16} className="text-primary shrink-0" />
        <h3 className="font-extrabold text-[15px] text-foreground">موقعي المباشر</h3>
      </div>
      <div
        className="mx-4 mb-4 h-[140px] rounded-xl bg-muted/60 border border-dashed border-border flex flex-col items-center justify-center gap-1.5"
        data-testid="placeholder-live-location"
      >
        <MapPin size={22} className="text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground/70 font-medium">قريباً: تتبع الموقع المباشر</p>
      </div>
    </div>
  );
}
