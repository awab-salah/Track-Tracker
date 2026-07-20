import { useEffect, useState } from 'react';
import { reverseGeocode } from '@/services/geocode';

/**
 * Resolve a raw `driver.location` string into a human-readable Arabic label.
 *
 * `driver.location` may be either:
 *   - a raw `"${lat}, ${lng}"` string written by `useLocationTracking`, OR
 *   - an already-human-readable city/region name.
 *
 * This hook detects the coordinate pattern and reverse-geocodes it via the
 * shared `reverseGeocode` service (which is internally throttled + cached
 * per Nominatim usage policy). Strings that do not look like coordinates
 * pass through unchanged. Returns `null` while a geocode request is in
 * flight; callers may fall back to the raw string in that window.
 *
 * Per spec: this does NOT change how the location is stored — the
 * `drivers.location` column still holds whatever the tracking hook wrote.
 * This hook is read-only and purely for display.
 *
 * Shared by:
 *   - Driver Details (Company Dashboard)  — `src/pages/DriverDetails.tsx`
 *   - Driver cards in the Drivers tab     — `src/components/dashboard/DriverCard.tsx`
 *
 * Do NOT duplicate this logic — add new callers here.
 */
export function useResolvedLocation(
  rawLocation: string | undefined | null,
): string | null {
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const raw = (rawLocation ?? '').trim();
    // Detect "lat, lng" pattern: two numbers separated by a comma.
    const coordMatch = raw.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (!coordMatch) {
      // Already a city name (or empty) — use as-is.
      setResolved(raw || '—');
      return;
    }
    const lat = Number(coordMatch[1]);
    const lng = Number(coordMatch[2]);
    // Reset to null while re-resolving so callers can fall back to the raw
    // string instead of flashing a stale label from a previous driver.
    setResolved(null);
    void reverseGeocode(lat, lng).then((label) => {
      if (!cancelled) setResolved(label);
    });
    return () => {
      cancelled = true;
    };
  }, [rawLocation]);

  return resolved;
}
