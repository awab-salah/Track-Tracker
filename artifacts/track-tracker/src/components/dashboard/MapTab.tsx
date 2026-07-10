import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useLocation } from 'wouter';
import { MOCK_DRIVERS } from '@/data/mockData';

// Fix leaflet default icon paths in Vite
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

export function MapTab() {
  const [, setLocation] = useLocation();
  const [mapHeight, setMapHeight] = useState(400);

  useEffect(() => {
    // Dynamically calculate available height after header + tab bar
    const headerEl = document.querySelector('[data-map-header]');
    const tabEl = document.querySelector('[data-map-tabs]');
    const headerH = (headerEl as HTMLElement | null)?.offsetHeight ?? 60;
    const tabH = (tabEl as HTMLElement | null)?.offsetHeight ?? 62;
    setMapHeight(window.innerHeight - headerH - tabH);
  }, []);

  // Centre of Iraq as default view
  const center: [number, number] = [33.5, 43.8];

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
        zoom={6}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {MOCK_DRIVERS.map((driver) => (
          <Marker
            key={driver.id}
            position={[driver.lat, driver.lng]}
            icon={makeDriverIcon(driver.name.charAt(0))}
            eventHandlers={{
              click: () => setLocation(`/driver/${driver.id}`),
            }}
          >
            <Popup>
              <div style={{ fontFamily: 'Cairo,sans-serif', direction: 'rtl', minWidth: 150 }}>
                <p style={{ fontWeight: 700, marginBottom: 3, fontSize: 14 }}>{driver.name}</p>
                <p style={{ color: '#666', fontSize: 12, margin: 0 }}>{driver.location}</p>
                <p style={{ color: '#C97A56', fontSize: 12, marginTop: 4, fontWeight: 600 }}>
                  اضغط للتفاصيل
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </motion.div>
  );
}
