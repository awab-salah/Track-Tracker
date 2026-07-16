/**
 * Reverse-geocode a (lat, lng) pair into a human-readable Arabic location
 * string using OpenStreetMap Nominatim (free, no API key).
 *
 * Used by Driver Details (Company Dashboard) to show a friendly city name
 * instead of raw GPS coordinates.
 *
 * Per spec: this does NOT change how the location is stored — the
 * `drivers.location` column still holds the raw "${lat}, ${lng}" string
 * written by useLocationTracking. This utility is read-only and purely
 * for display.
 *
 * Nominatim usage policy: <https://operations.osmfoundation.org/policies/nominatim/>
 *   - Max 1 request per second
 *   - Must provide a valid HTTP Referer or User-Agent
 *
 * We throttle locally with a 1-request-per-second minimum gap so we stay
 * well within the policy regardless of how often the UI asks.
 */

const MIN_GAP_MS = 1100; // 1.1s — small buffer over the 1s policy limit

/** Last request timestamp — module-level so all callers share the throttle. */
let lastRequestTs = 0;

/** Simple in-memory cache keyed by `${lat.toFixed(4)},${lng.toFixed(4)}`. */
const cache = new Map<string, string>();

export interface ReverseGeocodeResult {
  /** Arabic human-readable string, e.g. "هيت، الأنبار" or "بغداد، الكرادة". */
  label: string;
}

/**
 * Reverse-geocode (lat, lng) → Arabic label.
 * Returns the raw "${lat}, ${lng}" string if the request fails or returns
 * no usable address, so callers can always render something.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // Throttle: ensure at least MIN_GAP_MS since the last network request.
  const now = Date.now();
  const wait = Math.max(0, MIN_GAP_MS - (now - lastRequestTs));
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastRequestTs = Date.now();

  const url =
    `https://nominatim.openstreetmap.org/reverse` +
    `?format=jsonv2` +
    `&lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lng)}` +
    `&accept-language=ar`;

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      address?: {
        city?: string;
        town?: string;
        village?: string;
        suburb?: string;
        neighbourhood?: string;
        county?: string;
        state?: string;
        country?: string;
      };
      display_name?: string;
    };

    const a = data.address ?? {};
    // Prefer the most specific settlement name available.
    const settlement =
      a.city || a.town || a.village || a.suburb || a.neighbourhood || a.county || '';
    const region = a.state || '';
    const label = [settlement, region].filter(Boolean).join('، ')
      || data.display_name
      || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    cache.set(cacheKey, label);
    return label;
  } catch {
    // Fall back to raw coordinates — never throw from this utility.
    const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    cache.set(cacheKey, fallback);
    return fallback;
  }
}
