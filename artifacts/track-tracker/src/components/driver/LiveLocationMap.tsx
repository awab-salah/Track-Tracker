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

  // Initialise Leaflet once
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
      map.remove();
      mapRef.current  = null;
      markerRef.current = null;
    };
  }, []);

  // Update marker + pan when coords change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coords) return;

    const pos: L.LatLngExpression = [coords.lat, coords.lng];
    if (markerRef.current) {
      markerRef.current.setLatLng(pos);
    } else {
      markerRef.current = L.marker(pos, { icon: makeSelfIcon() }).addTo(map);
    }
    map.setView(pos, 15, { animate: true });
  }, [coords]);

  // ── Permission-denied: full-card error state (skip map) ──────────────────

  if (status === 'denied') {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-black/[0.04] dark:border-white/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
        <div className="p-4 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-primary shrink-0" />
            <h3 className="font-extrabold text-[15px] text-foreground">موقعي المباشر</h3>
          </div>
          <StatusPill status={status} />
        </div>
        <div className="px-4 pb-5 flex flex-col items-center gap-3 text-center">
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
      </div>
    );
  }

  // ── Normal card with embedded map ────────────────────────────────────────

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

      {/* Map — always mounted so Leaflet has a stable DOM node */}
      <div
        className="mx-4 rounded-xl overflow-hidden border border-border relative"
        style={{ height: 160 }}
      >
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

        {/* Overlay when no GPS fix yet */}
        {showOverlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/85 gap-2 pointer-events-none">
            {overlayContent}
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
