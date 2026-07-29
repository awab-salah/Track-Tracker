/**
 * AuthContext — single source of truth for Supabase session state.
 *
 * Wraps the entire app and exposes:
 *   - session / user     → raw Supabase objects
 *   - role               → 'company' | 'driver' | null
 *   - companyId          → UUID of the companies row (company users)
 *   - driverId           → UUID of the drivers row (driver users)
 *   - companyProfile     → loaded CompanyProfile (company users)
 *   - driverProfile      → loaded Driver + companyId (driver users)
 *   - isLoading          → true while the initial session is being resolved
 *
 * AppContext consumes this to bootstrap its data layer.
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { fetchCompanyByAuthUserId } from '@/services/companyRepository';
import { fetchDriverByAuthUserId } from '@/services/driverRepository';
import type { CompanyProfile } from '@/types';
import type { Driver } from '@/data/mockData';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Role = 'company' | 'driver' | null;

export interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: Role;
  companyId: string | null;
  driverId: string | null;
  companyProfile: CompanyProfile | null;
  driverProfile: (Driver & { companyId: string; companyName: string }) | null;
  isLoading: boolean;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [driverProfile, setDriverProfile] = useState<
    (Driver & { companyId: string; companyName: string }) | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Version counter: every call to loadProfile increments this.
   * A response only commits its state if its version is still current —
   * this prevents a slow getSession() call from overwriting a newer
   * onAuthStateChange result.
   */
  const loadVersionRef = useRef(0);

  /**
   * Resolves the DB profile for the signed-in auth user.
   * Reads role from user_metadata and then fetches the matching DB row.
   * All state mutations are guarded by a version check.
   *
   * @param authUser The Supabase auth user (null if signed out).
   * @param isBackgroundRefresh If true, skip setting isLoading=true — this is
   *   a routine token refresh (TOKEN_REFRESHED) or background recovery, not an
   *   initial page load. Setting isLoading=true during a token refresh would
   *   unmount the protected route and destroy local component state.
   */
  const loadProfile = useCallback(async (authUser: User | null, isBackgroundRefresh = false) => {
    const myVersion = ++loadVersionRef.current;

    // Only show the loading spinner on initial page load, NOT on background
    // token refreshes. A TOKEN_REFRESHED event means the user is already
    // signed in and their session is healthy — there is no reason to show
    // a loading screen or unmount the protected route.
    if (!isBackgroundRefresh) {
      setIsLoading(true);
    }

    if (!authUser || !isSupabaseConfigured) {
      if (loadVersionRef.current !== myVersion) return;
      setRole(null);
      setCompanyId(null);
      setDriverId(null);
      setCompanyProfile(null);
      setDriverProfile(null);
      setIsLoading(false);
      return;
    }

    const userRole = (authUser.user_metadata?.role ?? null) as Role;

    if (userRole === 'company') {
      const profile = await fetchCompanyByAuthUserId(authUser.id);
      if (loadVersionRef.current !== myVersion) return; // stale — newer call won

      setRole('company');
      setCompanyId(profile?.id ?? null);
      setCompanyProfile(
        profile
          ? { name: profile.name, email: profile.email, joinCode: profile.joinCode, logoUrl: profile.logoUrl, subscriptionActive: profile.subscriptionActive }
          : null
      );
      setDriverId(null);
      setDriverProfile(null);

    } else if (userRole === 'driver') {
      const drv = await fetchDriverByAuthUserId(authUser.id);
      if (loadVersionRef.current !== myVersion) return; // stale

      setRole('driver');
      setDriverId(drv?.id ?? null);
      setDriverProfile(drv ?? null);
      setCompanyId(null);
      setCompanyProfile(null);

    } else {
      if (loadVersionRef.current !== myVersion) return;
      setRole(null);
      setCompanyId(null);
      setDriverId(null);
      setCompanyProfile(null);
      setDriverProfile(null);
    }

    if (loadVersionRef.current === myVersion) {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Resolve any existing session on mount (handles page refresh)
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      void loadProfile(s?.user ?? null);
    });

    // Subscribe to future auth state changes (sign-in, sign-out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);

      // Determine whether this is a background refresh that should NOT
      // reset the loading state. TOKEN_REFRESHED is a routine background
      // event that happens every ~60 minutes — the user is already signed
      // in and their session is healthy. Setting isLoading=true here would
      // unmount the protected route and destroy local component state.
      //
      // Only SIGNED_IN (initial sign-in) and the initial getSession() call
      // should show the loading spinner.
      const isBackgroundRefresh =
        event === 'TOKEN_REFRESHED' ||
        event === 'PASSWORD_RECOVERY';

      void loadProfile(s?.user ?? null, isBackgroundRefresh);

      // For genuine sign-out events, ensure isLoading is set to false
      // so the user isn't stuck on the loading spinner.
      if (event === 'SIGNED_OUT') {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        role,
        companyId,
        driverId,
        companyProfile,
        driverProfile,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
