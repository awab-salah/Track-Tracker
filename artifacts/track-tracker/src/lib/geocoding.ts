/**
 * Reverse geocoding — turns a driver's raw lat/lng into a short, human-readable
 * Arabic place name (e.g. "بغداد - الكرادة") instead of ever showing raw
 * coordinates in the UI.
 *
 * Uses OpenStreetMap's Nominatim public reverse-geocoding endpoint — no API
 * key required, consistent with the tile provider already used by the app's
 * Leaflet maps (MapTab / DriverDetails / LiveLocationMap).
 *
 * Results are cached in memory (keyed by coordinates rounded to ~100m) so the
 * same driver position is never looked up twice in one session, and requests
 * are de-duplicated so rapid re-renders don't fire duplicate network calls.
 */

const cache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

/** Builds a short "governorate/city - area" style label from a Nominatim address object. */
function formatAddress(address: Record<string, string | undefined>): string | null {
  const area =
    address.suburb ?? address.neighbourhood ?? address.town ?? address.village ?? address.city_district;
  const city = address.city ?? address.town ?? address.state ?? address.county;

  if (city && area && city !== area) return `${city} - ${area}`;
  if (city) return city;
  if (area) return area;
  return null;
}

/**
 * Reverse-geocode a coordinate pair into a short place name.
 * Returns null on any failure (network error, no result, invalid response) —
 * callers must show a fallback such as "موقع غير معروف" (Unknown location).
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = cacheKey(lat, lng);
  if (cache.has(key)) return cache.get(key) ?? null;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&accept-language=ar`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`reverse geocode HTTP ${res.status}`);

      const data = (await res.json()) as { address?: Record<string, string | undefined>; display_name?: string };
      const label = (data.address && formatAddress(data.address)) || data.display_name || null;

      cache.set(key, label);
      return label;
    } catch (err) {
      console.error('[geocoding] reverseGeocode failed:', err);
      cache.set(key, null);
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}
