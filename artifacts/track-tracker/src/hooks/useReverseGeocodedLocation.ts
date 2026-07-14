import { useEffect, useState } from 'react';
import { reverseGeocode } from '@/lib/geocoding';

const UNKNOWN_LOCATION = 'موقع غير معروف';

/**
 * Resolves a driver's lat/lng into a short, human-readable place name for
 * display. Never surfaces raw coordinates — shows a lightweight "loading"
 * placeholder while the lookup is in flight, and falls back to
 * "موقع غير معروف" (Unknown location) if the lookup fails.
 */
export function useReverseGeocodedLocation(lat: number | undefined, lng: number | undefined): {
  label: string;
  loading: boolean;
} {
  const [label, setLabel] = useState(UNKNOWN_LOCATION);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (lat === undefined || lng === undefined || Number.isNaN(lat) || Number.isNaN(lng)) {
      setLabel(UNKNOWN_LOCATION);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void reverseGeocode(lat, lng).then((result) => {
      if (cancelled) return;
      setLabel(result ?? UNKNOWN_LOCATION);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return { label, loading };
}
