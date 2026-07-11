/**
 * MapTab — Company owner live map
 *
 * Shows all company drivers as named markers on an OpenStreetMap tile layer.
 * Initial positions come from AppContext (fetched on login). A Supabase
 * Realtime subscription on the `drivers` table keeps positions current without
 * requiring the owner to refresh the page.
 *
 * Prerequisites (run once in your Supabase project):
 *   alter publication supabase_realtime add table public.drivers;
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useLocation } from 'wouter';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/store/AuthContext';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { Driver } from '@/data/mockData';

// Fix Vite asset URLs for Leaflet's default marker icons
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
});

function makeDriverIcon(initial: string) {
  return L.divIcon({
    html: `
      <div style="
        width:42px;height:42px;border-radius:50%;
        background:#0D4D5A;border:3px solid #fff;
        box-shadow:0 3px 10px rgba(13,77,90,0.4);
        display:flex;align-items:center;justify-content:center;
        color:#fff;font-size:17px;font-weight:800;
        font-family:Cairo,sans-serif;
      ">${initial}</div>
    `,
    className: '',
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -26],
  });
}

/** Shape of the columns we care about from the realtime payload. */
interface DriverLocationRow {
  id: string;
  lat: number;
  lng: number;
  location: string;
}

export function MapTab() {
  const [, setLocation] = useLocation();
  const { drivers } = useApp();
  const { companyId } = useAuth();

  // Local mirror of driver positions — initialised from AppContext and kept
  // current by the Supabase Realtime subscription below.
  const [liveDrivers, setLiveDrivers] = useState<Driver[]>(drivers);

  // Keep in sync when AppContext re-fetches (e.g. after sign-in / page refresh)
  useEffect(() => {
    setLiveDrivers(drivers);
  }, [drivers]);

  // ── Supabase Realtime ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !companyId) return;

    const channel = supabase
      .channel(`company-drivers-location-${companyId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'drivers',
          // Only receive updates for this company's drivers
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const row = payload.new as DriverLocationRow;
          setLiveDrivers((prev) =>
            prev.map((d) =>
              d.id === row.id
                ? { ...d, lat: row.lat, lng: row.lng, location: row.location }
                : d,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId]);

  // ── Layout height ───────────────────────────────────────────────────────────
  const [mapHeight, setMapHeight] = useState(400);
  useEffect(() => {
    const headerEl = document.querySelector('[data-map-header]');
    const tabEl = document.querySelector('[data-map-tabs]');
    const headerH = (headerEl as HTMLElement | null)?.offsetHeight ?? 60;
    const tabH = (tabEl as HTMLElement | null)?.offsetHeight ?? 62;
    setMapHeight(window.innerHeight - headerH - tabH);
  }, []);

  // Centre on Iraq; if we have live drivers with valid coords, prefer them
  const validDrivers = liveDrivers.filter(
    (d) => Number.isFinite(d.lat) && Number.isFinite(d.lng) && (d.lat !== 0 || d.lng !== 0),
  );
  const center: [number, number] =
    validDrivers.length > 0
      ? [validDrivers[0].lat, validDrivers[0].lng]
      : [33.5, 43.8];

  return (
    <motion.div
      key="map"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{ height: mapHeight }}
    >
      <MapContainer
        center={center}
        zoom={validDrivers.length > 0 ? 10 : 6}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {liveDrivers.map((driver) =>
          Number.isFinite(driver.lat) && Number.isFinite(driver.lng) ? (
            <Marker
              key={driver.id}
              position={[driver.lat, driver.lng]}
              icon={makeDriverIcon(driver.name.charAt(0))}
              eventHandlers={{
                click: () => setLocation(`/driver/${driver.id}`),
              }}
            >
              <Popup>
                <div
                  style={{
                    fontFamily: 'Cairo,sans-serif',
                    direction: 'rtl',
                    minWidth: 150,
                  }}
                >
                  <p style={{ fontWeight: 700, marginBottom: 3, fontSize: 14 }}>
                    {driver.name}
                  </p>
                  <p style={{ color: '#666', fontSize: 12, margin: 0 }}>
                    {driver.location || driver.vehicleNumber}
                  </p>
                  <p
                    style={{
                      color: '#C97A56',
                      fontSize: 12,
                      marginTop: 4,
                      fontWeight: 600,
                    }}
                  >
                    اضغط للتفاصيل
                  </p>
                </div>
              </Popup>
            </Marker>
          ) : null,
        )}
      </MapContainer>
    </motion.div>
  );
}
