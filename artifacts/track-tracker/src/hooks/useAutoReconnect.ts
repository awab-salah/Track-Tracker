import { useEffect, useRef, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * useAutoReconnect — monitors Supabase realtime connection and
 * automatically reconnects when the app regains focus or when
 * the connection drops.
 *
 * Features:
 *   - Reconnects when the browser tab becomes visible again
 *   - Reconnects when the network comes back online
 *   - Periodic heartbeat to detect stale connections
 *   - Exponential backoff on reconnection attempts
 */
export function useAutoReconnect() {
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reconnect = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.warn('[AutoReconnect] Max reconnect attempts reached, stopping');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
    reconnectAttemptsRef.current++;

    console.log(
      `[AutoReconnect] Attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts} in ${delay}ms`
    );

    setTimeout(async () => {
      try {
        // Refresh the Supabase session to re-establish connection
        const { error } = await supabase.auth.refreshSession();
        if (error) {
          console.error('[AutoReconnect] Session refresh failed:', error.message);
        } else {
          console.log('[AutoReconnect] Session refreshed successfully');
          reconnectAttemptsRef.current = 0; // Reset on success
        }
      } catch (err) {
        console.error('[AutoReconnect] Reconnect error:', err);
      }
    }, delay);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    // ── Handle visibility change (tab focus) ──────────────────────────────
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        reconnectAttemptsRef.current = 0; // Reset on visibility change
        reconnect();
      }
    };

    // ── Handle online/offline events ──────────────────────────────────────
    const handleOnline = () => {
      console.log('[AutoReconnect] Network back online');
      reconnectAttemptsRef.current = 0;
      reconnect();
    };

    const handleOffline = () => {
      console.log('[AutoReconnect] Network went offline');
    };

    // ── Periodic heartbeat (every 2 minutes) ─────────────────────────────
    heartbeatIntervalRef.current = setInterval(async () => {
      if (document.visibilityState !== 'visible') return; // Skip if tab hidden
      try {
        // Lightweight check — just refresh the session
        const { error } = await supabase.auth.getSession();
        if (error) {
          console.warn('[AutoReconnect] Heartbeat detected stale session');
          reconnect();
        }
      } catch {
        console.warn('[AutoReconnect] Heartbeat failed');
        reconnect();
      }
    }, 2 * 60 * 1000);

    // ── Listen for Supabase auth events ───────────────────────────────────
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED') {
        reconnectAttemptsRef.current = 0;
      }
    });

    // ── Register listeners ────────────────────────────────────────────────
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      subscription.unsubscribe();
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [reconnect]);
}
