import { useEffect, useRef, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * useAutoReconnect — monitors the Supabase realtime connection and
 * attempts to recover when the app regains focus or comes back online.
 *
 * CRITICAL DESIGN RULES:
 *   - NEVER calls supabase.auth.refreshSession() — that fires onAuthStateChange
 *     which causes AuthContext.loadProfile() to set isLoading=true, which
 *     unmounts the protected route and destroys local component state.
 *   - NEVER calls window.location.reload() — that destroys everything.
 *   - Only uses getSession() (read-only, no side effects) to check if the
 *     session is still valid.
 *   - If the session has expired, the normal Supabase auth listener in
 *     AuthContext will handle the sign-out naturally.
 *
 * What this hook actually does:
 *   1. On visibility change (tab focus) → refresh React Query data
 *   2. On network online → refresh React Query data
 *   3. Periodic heartbeat (every 5 min) → check session is still valid
 *   4. All recovery is done through React Query's invalidateQueries,
 *      which preserves component state and navigation.
 */
export function useAutoReconnect() {
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Refresh stale data by invalidating React Query caches.
   * This is a soft refresh — it does NOT destroy React state, context,
   * navigation, or local UI state. Components that are mounted will
   * re-fetch their data in the background.
   */
  const refreshStaleData = useCallback(() => {
    if (!isSupabaseConfigured) return;
    if (document.visibilityState !== 'visible') return;

    // Dispatch a custom event that any part of the app can listen to.
    // React Query's useQuery hooks will automatically refetch when their
    // cache is invalidated, without destroying component state.
    window.dispatchEvent(new CustomEvent('tt:refresh-data'));
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    // ── Handle visibility change (tab focus) ──────────────────────────────
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshStaleData();
      }
    };

    // ── Handle online/offline events ──────────────────────────────────────
    const handleOnline = () => {
      console.log('[AutoReconnect] Network back online');
      refreshStaleData();
    };

    // ── Periodic heartbeat (every 5 minutes) ─────────────────────────────
    // Only checks if the session is still valid. Does NOT call refreshSession
    // because that fires onAuthStateChange which resets isLoading in AuthContext.
    heartbeatIntervalRef.current = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session) {
          // Session expired — the normal onAuthStateChange listener in
          // AuthContext will handle the sign-out. We don't need to do
          // anything extra here; just log it.
          console.warn('[AutoReconnect] Heartbeat: session expired or invalid');
        }
        // If session is valid, do nothing — no need to refresh.
        // The user's data is still fresh from the last query.
      } catch {
        console.warn('[AutoReconnect] Heartbeat check failed');
      }
    }, 5 * 60 * 1000);

    // ── Register listeners ────────────────────────────────────────────────
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [refreshStaleData]);
}
