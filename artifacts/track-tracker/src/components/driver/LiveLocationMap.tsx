/**
 * LiveLocationMap — display-only component
 *
 * Receives tracking state as props (owned by DriverDashboard) and renders:
 *   - A Leaflet map with a live marker when coordinates are available
 *   - A "acquiring" spinner overlay while waiting for the first GPS fix
 *   - A clear permission-denied error card when the user blocks location
 *   - A general error state for GPS/timeout failures
 *
 * No start/stop controls — tracking is automatic and always on.
 *
 * ── Leaflet lifecycle safety ──
 *
 * The map container `<div ref={containerRef}>` is ALWAYS mounted (even when
 * the `denied` card is shown on top). This is critical: Leaflet caches DOM
 * references via `el._leaflet_pos` and crashes with
 * "Cannot read properties of undefined (reading '_leaflet_pos')" if its
 * container is removed from the DOM while internal pan/zoom handlers are
 * still scheduled. By keeping the container mounted for the component's
 * entire lifetime, Leaflet always has a stable DOM node to talk to.
 *
 * The cleanup path additionally:
 *   - nulls `mapRef.current` BEFORE calling `map.remove()` so any pending
 *     effect that re-enters during teardown early-exits;
 *   - wraps `map.remove()` in try/catch so a partial-DOM-state during
 *     React 19 strict-mode double-invoke or AnimatePresence exit never
 *     propagates a runtime error to the preview;
 *   - verifies `document.body.contains(el)` before any post-mount map
 *     operation (`setView`, marker updates) to skip work on detached nodes.
 */
import { useEffect, useRef } from 'react';
import { MapPin, AlertCircle, Loader2, LocateFixed } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LocationCoords, TrackingStatus } from '@/hooks/useLocationTracking';

// Fix Vite asset URLs for Leaflet's default marker icons
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl:       new URL('leaflet/dist/images/marker-icon.png',    import.meta.url).href,
  shadowUrl:     new URL('leaflet/dist/images/marker-shadow.png',  import.meta.url).href,
});

function makeSelfIcon() {
  return L.divIcon({
    html: `
      <div style="
        width:32px;height:32px;border-radius:50%;
        background:#0D4D5A;border:3px solid #fff;
        box-shadow:0 2px 8px rgba(13,77,90,0.45);
        display:flex;align-items:center;justify-content:center;
      ">
        <div style="width:10px;height:10px;border-radius:50%;background:#7ED4E8;"></div>
      </div>`,
    className:  '',
    iconSize:   [32, 32],
    iconAnchor: [16, 16],
  });
}

// ── Status pill ───────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: TrackingStatus }) {
  if (status === 'tracking') {
    return (
      <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 select-none">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        جاري التتبع
      </span>
    );
  }
  if (status === 'acquiring') {
    return (
      <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 select-none">
        <Loader2 size={10} className="animate-spin" />
        جاري التحديد
      </span>
    );
  }
  if (status === 'denied' || status === 'error') {
    return (
      <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 select-none">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        غير متاح
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground select-none">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
      متوقف
    </span>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface LiveLocationMapProps {
  status:        TrackingStatus;
  coords:        LocationCoords | null;
  locationError: string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LiveLocationMap({ status, coords, locationError }: LiveLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<L.Map | null>(null);
  const markerRef    = useRef<L.Marker | null>(null);

  // Initialise Leaflet once. The container `<div ref={containerRef}>` is
  // ALWAYS mounted (see render below) so this effect can safely assume
  // the node exists. Cleanup nulls the ref BEFORE `map.remove()` so any
  // pending effect that re-enters during teardown early-exits, and wraps
  // `map.remove()` in try/catch so partial-DOM-state during React 19
  // strict-mode double-invoke or AnimatePresence exit never propagates a
  // runtime error.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      center:            [33.3152, 44.3661], // Baghdad default
      zoom:              13,
      zoomControl:       false,
      attributionControl: false,
      dragging:          false,
      touchZoom:         false,
      doubleClickZoom:   false,
      scrollWheelZoom:   false,
      boxZoom:           false,
      keyboard:          false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    mapRef.current = map;

    return () => {
      // Null the ref FIRST so the coords effect (which depends on
      // `mapRef.current`) early-exits if it fires during teardown.
      const m = mapRef.current;
      mapRef.current = null;
      markerRef.current = null;
      if (!m) return;
      // `map.remove()` can throw if the container has already been
      // detached from the document (e.g. AnimatePresence exit + a pending
      // Leaflet animation frame). Swallow the error — the map instance is
      // unreachable after this point anyway, and React will GC the DOM
      // node immediately after.
      try {
        m.remove();
      } catch {
        // no-op — Leaflet was already torn down or the DOM is gone.
      }
    };
  }, []);

  // Update marker + pan when coords change. Guard against a detached
  // container (can happen during unmount if a GPS update fires after
  // React has started removing the DOM node).
  useEffect(() => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (!map || !coords || !el) return;
    // Skip if the container has been removed from the document — Leaflet
    // would try to read `_leaflet_pos` off a detached node and crash.
    if (!document.body.contains(el)) return;

    const pos: L.LatLngExpression = [coords.lat, coords.lng];
    if (markerRef.current) {
      markerRef.current.setLatLng(pos);
    } else {
      markerRef.current = L.marker(pos, { icon: makeSelfIcon() }).addTo(map);
    }
    map.setView(pos, 15, { animate: true });
  }, [coords]);

  // ── Permission-denied: full-card error state ──────────────────────────
  // The map container `<div ref={containerRef}>` is STILL rendered below
  // (just visually hidden) so Leaflet has a stable DOM node. Removing it
  // from the DOM here would crash Leaflet with `_leaflet_pos` of
  // undefined the next time a pan/zoom handler fires.
  const isDenied = status === 'denied';

  // Decide what to show in the map overlay
  const showOverlay = !coords;
  let overlayContent: React.ReactNode = null;

  if (showOverlay) {
    if (status === 'error') {
      overlayContent = (
        <>
          <AlertCircle size={22} className="text-destructive/60" />
          <p className="text-xs text-destructive/70 font-medium text-center px-4">
            {locationError ?? 'تعذّر تحديد الموقع'}
          </p>
        </>
      );
    } else {
      overlayContent = (
        <>
          <LocateFixed size={22} className="text-primary/40 animate-pulse" />
          <p className="text-xs text-muted-foreground/70 font-medium">
            جارٍ تحديد موقعك…
          </p>
        </>
      );
    }
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06]">

      {/* Header */}
      <div className="p-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-primary shrink-0" />
          <h3 className="font-extrabold text-[15px] text-foreground">موقعي المباشر</h3>
        </div>
        <StatusPill status={status} />
      </div>

      {/* Map — ALWAYS mounted so Leaflet has a stable DOM node.
          When `denied`, the error overlay below covers the map visually
          (the map stays in the DOM so Leaflet doesn't crash on its next
          scheduled pan/zoom). */}
      <div
        className="mx-4 rounded-xl overflow-hidden border border-border relative"
        style={{ height: 160 }}
      >
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

        {/* Overlay when no GPS fix yet */}
        {showOverlay && !isDenied && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/85 gap-2 pointer-events-none">
            {overlayContent}
          </div>
        )}

        {/* Permission-denied overlay — covers the map with the error
            card. The map stays mounted underneath so Leaflet doesn’t
            crash on its next scheduled pan/zoom. */}
        {isDenied && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center bg-white dark:bg-zinc-900 px-4">
            <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mt-1">
              <AlertCircle size={28} className="text-red-500" />
            </div>
            <div>
              <p className="font-bold text-sm text-foreground">إذن الموقع مرفوض</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                يحتاج التطبيق إلى إذن الموقع لمشاركة موقعك مع الشركة.
                <br />
                افتح إعدادات المتصفح، فعّل إذن الموقع لهذا الموقع، ثم أعد تحميل الصفحة.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Accuracy footer */}
      <div className="px-4 py-3">
        {coords ? (
          <p className="text-xs text-muted-foreground text-center">
            دقة الموقع: ±{Math.round(coords.accuracy)} م
          </p>
        ) : (
          <p className="text-xs text-muted-foreground text-center">
            يتم مشاركة موقعك تلقائياً مع الشركة
          </p>
        )}
      </div>

    </div>
  );
}
