import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[TrackTracker] Supabase env vars missing — running in offline/mock mode. ' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable persistence.'
  );
}

/** Singleton Supabase client. Exported for use in service repositories. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = createClient<any>(
  SUPABASE_URL ?? 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY ?? 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
    global: {
      headers: {},
    },
  }
);

/** True when both env vars are configured and the client is usable. */
export const isSupabaseConfigured =
  Boolean(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY);

// ── Auto-reconnect & session restore on visibility change ─────────────────────
// When the user returns to the PWA tab after it was backgrounded,
// refresh the Supabase session and re-trigger React Query refetches.
if (typeof document !== 'undefined' && isSupabaseConfigured) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Refresh the auth session — if it expired while backgrounded,
      // Supabase will attempt to refresh the token automatically.
      supabase.auth.getSession().catch(() => {
        // Session expired and refresh failed — the AuthProvider will
        // handle the redirect to the login page.
      });
    }
  });

  // Listen for online/offline events to restore connectivity gracefully
  window.addEventListener('online', () => {
    // Give the network a moment to stabilise, then refresh session
    setTimeout(() => {
      supabase.auth.getSession().catch(() => {});
    }, 500);
  });
}
