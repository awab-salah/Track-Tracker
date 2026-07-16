/**
 * useLocationTracking
 *
 * Auto-starts GPS tracking as soon as it is mounted with a valid driverId.
 * No manual start/stop — the watch runs for the lifetime of the component
 * that owns it (DriverDashboard).
 *
 * Throttle rules: only write to Supabase when the driver has moved at least
 * MIN_DISTANCE_M metres OR MIN_INTERVAL_MS has elapsed since the last write.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_DISTANCE_M = 50;       // metres
const MIN_INTERVAL_MS = 30_000;  // 30 s

// ── Haversine ─────────────────────────────────────────────────────────────────

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LocationCoords {
  lat: number;
  lng: number;
  accuracy: number;
}

export type TrackingStatus = 'idle' | 'acquiring' | 'tracking' | 'error' | 'denied';

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLocationTracking(driverId: string | null) {
  const [status, setStatus]           = useState<TrackingStatus>('idle');
  const [coords, setCoords]           = useState<LocationCoords | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  /** Last position successfully pushed to Supabase. */
  const lastPushedRef = useRef<{ lat: number; lng: number; ts: number } | null>(null);

  /**
   * Keep driverId in a ref so pushLocation never needs to be re-created
   * when driverId changes — this keeps handlePosition stable and prevents
   * the watchPosition effect from restarting unnecessarily.
   */
  const driverIdRef = useRef(driverId);
  useEffect(() => { driverIdRef.current = driverId; }, [driverId]);

  // ── Supabase write (stable — no deps) ────────────────────────────────────

  const pushLocation = useCallback(async (lat: number, lng: number) => {
    const id = driverIdRef.current;
    if (!id || !isSupabaseConfigured) return;

    const location = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const { error } = await supabase
      .from('drivers')
      .update({ lat, lng, location })
      .eq('id', id);

    if (error) {
      console.error('[useLocationTracking] push error:', error.message);
    } else {
      lastPushedRef.current = { lat, lng, ts: Date.now() };
    }
  }, []); // intentionally empty — uses driverIdRef

  // ── Position callback (stable) ────────────────────────────────────────────

  const handlePosition = useCallback((pos: GeolocationPosition) => {
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    setCoords({ lat, lng, accuracy });
    setStatus('tracking');
    setLocationError(null);

    const last  = lastPushedRef.current;
    const now   = Date.now();
    const moved = last !== null && haversineMetres(last.lat, last.lng, lat, lng) >= MIN_DISTANCE_M;
    const stale = last === null || now - last.ts >= MIN_INTERVAL_MS;

    if (moved || stale) void pushLocation(lat, lng);
  }, [pushLocation]);

  // ── Error callback (stable) ───────────────────────────────────────────────

  const handleError = useCallback((err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) {
      setStatus('denied');
      setLocationError('تم رفض إذن الموقع.');
    } else if (err.code === err.POSITION_UNAVAILABLE) {
      setStatus('error');
      setLocationError('تعذّر تحديد موقعك. تأكد من تفعيل GPS.');
    } else {
      setStatus('error');
      setLocationError('انتهى وقت طلب الموقع. يرجى المحاولة مرة أخرى.');
    }
  }, []);

  // ── Auto-start on mount (or when driverId becomes available) ─────────────

  useEffect(() => {
    if (!driverId) return;

    if (!navigator.geolocation) {
      setStatus('error');
      setLocationError('المتصفح لا يدعم خاصية تحديد الموقع.');
      return;
    }

    // Show "acquiring" immediately so the UI reflects that we are working
    setStatus('acquiring');

    const watchId = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [driverId, handlePosition, handleError]);
  //   ^^^^^^^^ handlePosition & handleError are both stable, so this effect
  //            only re-runs when driverId actually changes.

  return { status, coords, locationError };
}
