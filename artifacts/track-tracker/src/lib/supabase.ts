import { createClient } from '@supabase/supabase-js';

/**
 * Supabase connection configuration.
 *
 * The URL and anon key are tried from environment variables first
 * (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).  If those are
 * missing — e.g. during a Vercel build that hasn't configured
 * project-level env vars — the hardcoded fallbacks are used instead.
 *
 * The anon key is a *publishable* key designed for client-side code;
 * it is safe to embed in the bundle.
 */
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://qexafenusvjkyzfhtpda.supabase.co';

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_x7im7A-wpUvo7MX8jCRICA_IPaKydUs';

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
  }
);

/** True when both env vars are configured and the client is usable. */
export const isSupabaseConfigured =
  Boolean(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY);
