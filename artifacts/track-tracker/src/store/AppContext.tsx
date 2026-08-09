import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useLocation } from 'wouter';
import {
  Driver,
  CargoItem,
  SaleRecord,
  SaleLineItem,
  formatIQD,
} from '@/data/mockData';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { signOut } from '@/lib/auth';
import {
  requestNotificationPermission as fcmRequestPermission,
  getNotificationPermission as fcmGetPermission,
  registerFcmToken,
  unregisterFcmToken,
  refreshFcmTokenIfNeeded,
  notifySaleViaEdgeFunction,
  getFcmDiagnostics,
  getFcmRegStatus,
  refreshFcmDiagnostics,
  sendTestNotification,
  type FcmDiagnostics,
} from '@/services/fcmService';
import { isFirebaseConfigured, getFirebaseMessaging } from '@/lib/firebaseConfig';
import {
  updateCompany,
  fetchDrivers,
  updateDriver,
  fetchLoads,
  upsertLoad as dbUpsertLoad,
  decrementLoad,
  removeLoad as dbRemoveLoad,
  replaceDriverLoads,
  fetchDailySnapshots,
  fetchSales,
  createSale,
  finalizeYesterdayIfNeeded,
} from '@/services';
import { useAuth } from '@/store/AuthContext';
import type { CompanyProfile } from '@/types';
import { baghdadToday } from '@/lib/dateUtils';

// ── Types ─────────────────────────────────────────────────────────────────────

// Re-export CompanyProfile so existing imports from @/store/AppContext continue to work.
export type { CompanyProfile } from '@/types';

interface AppContextType {
  company: CompanyProfile;
  darkMode: boolean;
  toggleDarkMode: () => void;
  updateLogo: (url: string) => void;
  setCompanyProfile: (data: Partial<Pick<CompanyProfile, 'name' | 'email'>>) => void;
  setJoinCode: (code: string) => void;
  regenerateJoinCode: () => void;
  logout: () => void;
  /** Activate the company subscription via an activation code. Persists to DB. */
  activateSubscription: (code: string) => Promise<boolean>;
  /**
   * Whether the company subscription is active. For company owners, mirrors
   * `company.subscriptionActive`. For drivers, fetched from the parent
   * company's `subscription_active` column. Used by the SubscriptionGate
   * to block business operations when inactive.
   */
  companySubscriptionActive: boolean;

  drivers: Driver[];
  loads: CargoItem[];
  sales: SaleRecord[];
  currentDriverId: string | null;
  currentDriver: Driver | null;
  logoutDriver: () => void;
  updateDriverProfile: (data: Partial<Pick<Driver, 'name' | 'email' | 'vehicleNumber' | 'profilePictureUrl'>>) => void;
  upsertLoad: (input: { id?: string; productName: string; quantity: number; unitPrice: number }) => void;
  removeLoad: (id: string) => void;
  /**
   * Promote a historical day's snapshot to live cargo. Replaces all current
   * live loads for the driver with the snapshot's items (filtered to qty > 0),
   * assigning fresh UUIDs. Returns the new live CargoItem[] so the caller can
   * open the Load tab with the matching item prefilled.
   *
   * Per spec: "If the driver edits any product from that remaining cargo...
   * It immediately becomes Current Cargo."
   */
  promoteSnapshotToLive: (driverId: string, snapshotDate: string) => Promise<CargoItem[]>;
  addSale: (items: SaleLineItem[], receiptImageUrl?: string | null) => void;

  /**
   * Latched "the current driver has edited cargo at least once today" flag.
   *
   * Per the revised midnight-logic spec: on Day 2, the cargo title starts as
   * "الحمولة المتبقية من اليوم السابق" (carried over from yesterday). The
   * moment the driver performs ANY mutation (add, remove, sell, change
   * quantity, edit price, or promote a historical snapshot to live), the
   * title MUST immediately flip to "الحمولة الحالية" and stay there for
   * the rest of the day — even across page refresh.
   *
   * Implementation: this flag is persisted in localStorage, keyed by
   * `(driverId, today)`, so it survives refresh and auto-resets at
   * midnight (a new day = a new key = flag starts false again).
   *
   * The carry-over algorithm itself (`isCargoCarriedOverToday`) is NOT
   * modified — this flag overrides its result at the title-resolution
   * layer (see `useCargoHistory`).
   */
  cargoEditedToday: boolean;

  // Sale notifications (company owner) — Web Notifications API + Supabase Realtime
  notificationsEnabled: boolean;
  notificationPermission: NotificationPermission | 'unsupported';
  enableNotifications: () => Promise<void>;
  disableNotifications: () => void;
  /** FCM push registration status — visible diagnostic (no DevTools needed) */
  fcmRegStatus: 'idle' | 'requesting' | 'registered' | 'failed' | 'unregistered';
  /** Human-readable error if fcmRegStatus === 'failed' */
  fcmRegError: string;
  /** Full FCM diagnostics for visible diagnostic panel */
  fcmDiagnostics: FcmDiagnostics;
  /** Send a test FCM notification through the production backend */
  sendTestFcmNotification: () => Promise<{ success: boolean; message: string }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateJoinCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `local-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
}

const DEFAULT_COMPANY: CompanyProfile = {
  name: '',
  email: '',
  joinCode: '',
  logoUrl: null,
  subscriptionActive: false,
};

// Local-only preference — Notification permission itself is a per-browser/device
// concept (not a company-level setting), so it is intentionally not persisted
// to Supabase. Kept in localStorage like the dark-mode toggle.
const NOTIFICATIONS_STORAGE_KEY = 'tt_notifications_enabled';

/**
 * Build the localStorage key for the "cargo edited today" latch.
 *
 * Keyed by `(driverId, today)` so the flag:
 *   - auto-resets at midnight (today changes → new key → flag starts false),
 *   - is per-driver (multiple drivers on the same browser don't collide),
 *   - survives page refresh (same key → same value).
 *
 * This latch is the mechanism that flips Day-2's cargo title from
 * "الحمولة المتبقية من اليوم السابق" to "الحمولة الحالية" after the driver's
 * FIRST cargo mutation of the day. The carry-over algorithm itself is NOT
 * modified — only the title-resolution layer consumes this flag.
 */
function cargoEditedTodayStorageKey(driverId: string, today: string): string {
  return `tt_cargo_edited_${driverId}_${today}`;
}

/** Read the latch from localStorage. Returns false if not set or unavailable. */
function readCargoEditedToday(driverId: string, today: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(cargoEditedTodayStorageKey(driverId, today)) === '1';
  } catch {
    return false;
  }
}

/** Write the latch to localStorage. Silently no-op if storage is unavailable. */
function writeCargoEditedToday(driverId: string, today: string, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) {
      localStorage.setItem(cargoEditedTodayStorageKey(driverId, today), '1');
    } else {
      localStorage.removeItem(cargoEditedTodayStorageKey(driverId, today));
    }
  } catch {
    /* ignore storage failures — flag is also kept in React state */
  }
}

function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

function dedupeLoads(loads: CargoItem[]): CargoItem[] {
  const byKey = new Map<string, CargoItem>();
  for (const load of loads) {
    const key = `${load.driverId}::${load.productName.trim().toLowerCase()}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity += load.quantity;
      existing.unitPrice = load.unitPrice;
    } else {
      byKey.set(key, { ...load });
    }
  }
  return Array.from(byKey.values());
}

// ── Context ───────────────────────────────────────────────────────────────────

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const {
    role,
    companyId: authCompanyId,
    driverId: authDriverId,
    companyProfile: authCompany,
    driverProfile: authDriverProfile,
    isLoading: authLoading,
  } = useAuth();

  const [company, setCompany] = useState<CompanyProfile>(DEFAULT_COMPANY);
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem('tt_dark') === '1'
  );

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loads, setLoads] = useState<CargoItem[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [currentDriverId, setCurrentDriverId] = useState<string | null>(null);

  // ── Company subscription active (driver context) ──────────────────────────
  // For company owners: comes from `company.subscriptionActive` (set during
  // bootstrap from AuthContext's companyProfile). For drivers: fetched from
  // the parent company's `subscription_active` column via Supabase query
  // during the driver bootstrap. Defaults to false so the gate blocks until
  // the fetch completes.
  const [driverCompanySubscriptionActive, setDriverCompanySubscriptionActive] = useState(false);

  // ── Cargo-edited-today latch ───────────────────────────────────────────────
  //
  // Latched flag: true iff the current driver has performed ANY cargo mutation
  // (add / remove / sell / change quantity / edit price / promote snapshot to
  // live) since midnight. Used by `useCargoHistory` to flip the Day-2 carry-over
  // title from "الحمولة المتبقية من اليوم السابق" to "الحمولة الحالية" on
  // the first mutation of the day. See the type-doc on `cargoEditedToday`
  // above for the full spec.
  //
  // `today` is recomputed on every render; if the calendar day rolls over
  // while the dashboard is open, the latch re-reads from localStorage under
  // the new key (which starts unset), effectively resetting the flag at
  // midnight without an explicit timer.
  const today = baghdadToday();
  const [cargoEditedToday, setCargoEditedToday] = useState<boolean>(() =>
    currentDriverId ? readCargoEditedToday(currentDriverId, today) : false,
  );

  // Re-read the latch whenever the driver or the calendar day changes.
  useEffect(() => {
    if (!currentDriverId) {
      setCargoEditedToday(false);
      return;
    }
    setCargoEditedToday(readCargoEditedToday(currentDriverId, today));
  }, [currentDriverId, today]);

  // Helper: latch the flag to true and persist. Called from every cargo
  // mutation handler below. No-op if no driver is signed in.
  const markCargoEditedToday = () => {
    if (!currentDriverId) return;
    writeCargoEditedToday(currentDriverId, today, true);
    setCargoEditedToday(true);
  };

  // ── Sale notifications (FCM-based) ──────────────────────────────────────
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) === '1'
  );
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => fcmGetPermission());

  // Kept in a ref (not a dependency of the subscription effect below) so that
  // routine driver-list refreshes don't tear down and re-create the realtime
  // channel — only role/company/toggle changes should do that.
  const driversRef = useRef<Driver[]>(drivers);
  useEffect(() => {
    driversRef.current = drivers;
  }, [drivers]);

  // In-memory dedup for sale notifications — prevents duplicate delivery
  // from Realtime reconnects or FCM retries.
  const notifiedSaleIdsRef = useRef<Map<string, number>>(new Map());

  // FCM registration status (visible diagnostic — no DevTools needed)
  const [fcmRegStatus, setFcmRegStatus] = useState<'idle' | 'requesting' | 'registered' | 'failed' | 'unregistered'>('idle');
  const [fcmRegError, setFcmRegError] = useState('');
  const [fcmDiagnosticsState, setFcmDiagnosticsState] = useState<FcmDiagnostics>(getFcmDiagnostics());

  // Sync FCM status from fcmService into React state
  useEffect(() => {
    // Initial refresh
    void refreshFcmDiagnostics();

    const interval = setInterval(() => {
      const d = getFcmDiagnostics();
      setFcmRegStatus(d.regStatus);
      setFcmRegError(d.lastError);
      setFcmDiagnosticsState(d);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // NOTE: Firebase config is hardcoded in sw.ts (the service worker) because
  // SWs cannot access import.meta.env. The previous FIREBASE_CONFIG postMessage
  // was a no-op since sw.ts has no handler for it. Removed to avoid confusion.
  // ── Dark mode ──────────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('tt_dark', darkMode ? '1' : '0');
  }, [darkMode]);

  // ── Bootstrap company data ─────────────────────────────────────────────────
  // Runs when a company owner signs in. Uses a cancellation flag so that
  // if auth changes before the fetch completes, stale results are discarded.
  useEffect(() => {
    if (authLoading) return;
    if (role !== 'company' || !authCompanyId || !authCompany) return;
    if (!isSupabaseConfigured) {
      setCompany(authCompany);
      return;
    }

    let cancelled = false;
    setCompany(authCompany);

    void (async () => {
      const remoteDrivers = await fetchDrivers(authCompanyId, authCompany.name);
      if (cancelled) return;

      const driverIds = remoteDrivers.map((d) => d.id);
      const [remoteLoads, remoteSales] = await Promise.all([
        fetchLoads(driverIds),
        fetchSales(driverIds),
      ]);
      if (cancelled) return;

      setDrivers(remoteDrivers);
      setLoads(dedupeLoads(remoteLoads));
      setSales(remoteSales);
      setCurrentDriverId(null);

      // Finalize yesterday's snapshot for each driver. Fire-and-forget —
      // each call is idempotent (unique constraint + ON CONFLICT DO NOTHING).
      // Reads current DB loads (no mutation has happened today yet at bootstrap).
      void Promise.all(
        remoteDrivers.map((d) => finalizeYesterdayIfNeeded(d.id))
      );
    })();

    return () => { cancelled = true; };
  // authCompany?.name is a stable string proxy for the company object reference
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, authCompanyId, authCompany?.name, authLoading]);

  // ── Bootstrap driver data ──────────────────────────────────────────────────
  // Runs when a driver signs in.
  useEffect(() => {
    if (authLoading) return;
    if (role !== 'driver' || !authDriverId || !authDriverProfile) return;
    if (!isSupabaseConfigured) {
      setCurrentDriverId(authDriverId);
      setDrivers([authDriverProfile]);
      // Without Supabase, assume active so the app works in mock mode
      setDriverCompanySubscriptionActive(true);
      return;
    }

    let cancelled = false;
    setCurrentDriverId(authDriverId);
    setDrivers([authDriverProfile]);
    // Reset subscription until we fetch it — gate will block during load
    setDriverCompanySubscriptionActive(false);

    void (async () => {
      // Fetch the parent company's subscription status FIRST so the gate
      // resolves quickly. If inactive, the driver sees the gate immediately.
      // Uses select('*') so we don't fail if the subscription_active column
      // doesn't exist yet (PostgREST omits unknown columns from select('*')
      // instead of erroring). We then check for the field in the response.
      const companyId = authDriverProfile.companyId;
      const { data: companyRow, error: companyErr } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single();
      if (!cancelled) {
        if (companyErr) {
          console.error('[AppContext] failed to fetch company subscription:', companyErr.message);
          setDriverCompanySubscriptionActive(false);
        } else {
          // subscription_active may be absent if the migration hasn't run yet.
          // In that case, default to false (gate blocks until migration runs).
          const rawRow = companyRow as Record<string, unknown>;
          setDriverCompanySubscriptionActive((rawRow.subscription_active as boolean) ?? false);
        }
      }

      const [remoteLoads, remoteSales] = await Promise.all([
        fetchLoads([authDriverId]),
        fetchSales([authDriverId]),
      ]);
      if (cancelled) return;
      setLoads(dedupeLoads(remoteLoads));
      setSales(remoteSales);

      // Finalize yesterday's snapshot for this driver. Fire-and-forget —
      // idempotent. Reads current DB loads (no mutation today yet).
      void finalizeYesterdayIfNeeded(authDriverId);
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, authDriverId, authLoading]);

  // ── Clear state on sign-out ────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !role) {
      setCompany(DEFAULT_COMPANY);
      setDrivers([]);
      setLoads([]);
      setSales([]);
      setCurrentDriverId(null);
      setDriverCompanySubscriptionActive(false);
    }
  }, [role, authLoading]);

  // ── Dark mode toggle ──────────────────────────────────────────────────────
  const toggleDarkMode = () => setDarkMode((prev) => !prev);

  const updateLogo = (url: string) => {
    // Persist the durable public URL (from Supabase Storage) to both local
    // state AND the companies table. The previous implementation only set
    // local state — so logoUrl was lost on refresh.
    setCompany((prev) => ({ ...prev, logoUrl: url }));
    if (authCompanyId) {
      void updateCompany(authCompanyId, { logoUrl: url });
    }
  };

  // ── Company profile mutations ─────────────────────────────────────────────

  const setCompanyProfile = (data: Partial<Pick<CompanyProfile, 'name' | 'email'>>) => {
    setCompany((prev) => ({ ...prev, ...data }));
    if (authCompanyId) {
      void updateCompany(authCompanyId, data);
    }
  };

  const setJoinCode = (code: string) => {
    setCompany((prev) => ({ ...prev, joinCode: code.toUpperCase() }));
    if (authCompanyId) {
      void updateCompany(authCompanyId, { joinCode: code });
    }
  };

  const regenerateJoinCode = () => {
    const newCode = generateJoinCode();
    setCompany((prev) => ({ ...prev, joinCode: newCode }));
    if (authCompanyId) {
      void updateCompany(authCompanyId, { joinCode: newCode });
    }
  };

  // ── Subscription activation ──────────────────────────────────────────────
  //
  // Uses the Supabase `activate_subscription` security-definer RPC to validate
  // the activation code and set `subscription_active = true` on the company row.
  // Activation persists ONLY in Supabase — no localStorage, no fallback.
  //
  // The only valid activation code for now is "track1".
  // Later Stripe will replace this — the architecture is ready.
  //
  // Activation strategy (ordered by preference):
  //   1. Call the `activate_subscription` security-definer RPC. This validates
  //      the code server-side and persists to the DB in one atomic call.
  //   2. If the RPC doesn't exist, validate the code locally and do a direct
  //      PostgREST UPDATE on the company row.
  //      This works because company owners have UPDATE RLS on their own row.
  //   3. If both strategies fail, return false (activation not persisted).
  //      The user sees an error and can retry later.

  const activateSubscription = async (code: string): Promise<boolean> => {
    // If the company is already active, return true immediately.
    // The UI layer checks companySubscriptionActive before calling this
    // function and shows an "already activated" message, but this guard
    // ensures that even if the UI bypass is missed, no duplicate activation
    // attempt reaches the database.
    if (company.subscriptionActive) return true;

    const normalizedCode = code.trim().toLowerCase();
    const isValid = normalizedCode === 'track1';

    if (!isValid) return false;

    if (!isSupabaseConfigured) {
      // Offline mode: accept "track1" and update local state only.
      // No localStorage — state lives only in React (lost on refresh,
      // which is correct since the DB is unreachable in offline mode).
      setCompany((prev) => ({ ...prev, subscriptionActive: true }));
      return true;
    }

    // ── Strategy 1: try the RPC ──
    try {
      const { data, error } = await supabase.rpc('activate_subscription', {
        p_activation_code: code.trim(),
      });

      if (!error) {
        const success = data as boolean;
        if (success) {
          setCompany((prev) => ({ ...prev, subscriptionActive: true }));
        }
        return success;
      }

      // RPC doesn't exist or failed — proceed to fallback strategy.
      if (error.message.includes('Could not find the function') || error.code === 'PGRST202') {
        console.warn('[AppContext] activate_subscription RPC not found — falling back to direct UPDATE.');
      } else {
        console.warn('[AppContext] activate_subscription RPC error:', error.message, '— falling back to direct UPDATE.');
      }
    } catch (err) {
      console.warn('[AppContext] activate_subscription RPC error:', err, '— falling back to direct UPDATE.');
    }

    // ── Strategy 2: direct PostgREST UPDATE ──
    // Company owners have `companies_owner` RLS policy which allows
    // UPDATE on their own row. This persists activation to the DB.
    const companyId = authCompanyId;
    if (companyId) {
      try {
        const { error: updateError } = await supabase
          .from('companies')
          .update({ subscription_active: true })
          .eq('id', companyId);

        if (!updateError) {
          setCompany((prev) => ({ ...prev, subscriptionActive: true }));
          return true;
        }

        console.warn('[AppContext] direct UPDATE failed:', updateError.message);
      } catch (err) {
        console.warn('[AppContext] direct UPDATE error:', err);
      }
    }

    // ── Strategy 3: both strategies failed — activation not persisted ──
    // Return false so the user sees an error and can retry.
    return false;
  };

  // ── Auth actions ──────────────────────────────────────────────────────────

  const logout = () => {
    void signOut().then(() => setLocation('/'));
  };

  const logoutDriver = () => {
    void signOut().then(() => setLocation('/'));
  };

  // ── Driver profile ────────────────────────────────────────────────────────

  const updateDriverProfile = (
    data: Partial<Pick<Driver, 'name' | 'email' | 'vehicleNumber' | 'profilePictureUrl'>>
  ) => {
    if (!currentDriverId) return;
    setDrivers((prev) =>
      prev.map((d) => (d.id === currentDriverId ? { ...d, ...data } : d))
    );
    void updateDriver(currentDriverId, data);
  };

  // ── Load management ───────────────────────────────────────────────────────

  const upsertLoad = (input: {
    id?: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }) => {
    if (!currentDriverId) return;
    const productName = input.productName.trim();

    // Capture pre-mutation cargo so the finalize call below freezes yesterday's
    // EOD state, not the post-edit state. UI updates synchronously via setLoads.
    const preMutationCargo = loads.filter((l) => l.driverId === currentDriverId);

    setLoads((prev) => {
      const existingIdx = prev.findIndex(
        (l) =>
          l.driverId === currentDriverId &&
          l.productName.trim().toLowerCase() === productName.toLowerCase()
      );

      if (existingIdx !== -1) {
        const updated = [...prev];
        const existing = { ...updated[existingIdx], quantity: input.quantity, unitPrice: input.unitPrice };
        updated[existingIdx] = existing;

        void dbUpsertLoad({
          id: existing.id,
          driverId: currentDriverId,
          productName: existing.productName,
          quantity: existing.quantity,
          unitPrice: existing.unitPrice,
          isNew: false,
        });

        return updated;
      }

      const newId = input.id ?? generateId();
      const newItem: CargoItem = {
        id: newId,
        driverId: currentDriverId,
        productName,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
      };

      void dbUpsertLoad({
        id: newId,
        driverId: currentDriverId,
        productName,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        isNew: true,
      });

      return [...prev, newItem];
    });

    // Finalize yesterday's snapshot AFTER local state update, using captured
    // pre-mutation state. Fire-and-forget — idempotent.
    void finalizeYesterdayIfNeeded(currentDriverId, preMutationCargo);

    // Latch the "cargo edited today" flag so the Day-2 carry-over title
    // immediately flips from "الحمولة المتبقية من اليوم السابق" to
    // "الحمولة الحالية". See the type-doc on `cargoEditedToday`.
    markCargoEditedToday();
  };

  const removeLoad = (id: string) => {
    if (!currentDriverId) return;
    // Capture pre-mutation cargo for the finalize call below.
    const preMutationCargo = loads.filter((l) => l.driverId === currentDriverId);
    setLoads((prev) => prev.filter((l) => l.id !== id));
    void dbRemoveLoad(id);
    void finalizeYesterdayIfNeeded(currentDriverId, preMutationCargo);
    // Latch the "cargo edited today" flag — removing a product is an edit.
    markCargoEditedToday();
  };

  // ── Historical snapshot → live cargo promotion ─────────────────────────────
  //
  // Per spec: when the driver edits any product from a past day's "Remaining
  // Cargo From This Day", that snapshot immediately becomes the live Current
  // Cargo. We:
  //   1. Fetch the snapshot for the given date.
  //   2. Filter out qty-0 items (already hidden in the UI, but defensive).
  //   3. Assign fresh UUIDs to each item (new live rows, not snapshot rows).
  //   4. Optimistically replace the driver's loads in local state.
  //   5. Atomically replace the driver's loads in the DB.
  //   6. Return the new live CargoItem[] so the caller can find the matching
  //      item and open the Load tab with it prefilled.
  //
  // Note: this is destructive — the driver's previous live loads are lost.
  // This is the intended behavior per spec ("It immediately becomes Current
  // Cargo because it is now the active working inventory again").
  //
  // SAFETY: if the snapshot for `snapshotDate` does not exist (or is empty),
  // we ABORT the promotion and return the current live cargo unchanged.
  // Without this guard, a missing snapshot would cause `setLoads` to delete
  // ALL of the driver's current live cargo — a destructive no-op. See Bug 4
  // in the worklog.
  const promoteSnapshotToLive = async (
    driverId: string,
    snapshotDate: string
  ): Promise<CargoItem[]> => {
    const snapshotItems = await fetchDailySnapshots([driverId], snapshotDate);
    const itemsToPromote = snapshotItems.filter((item) => item.quantity > 0);

    // SAFETY: no snapshot (or all-qty-0 snapshot) → abort promotion.
    // Return the driver's CURRENT live cargo unchanged so the caller can
    // still open the editor against the matching product. Without this
    // guard, a missing snapshot would cause `setLoads` to delete ALL of
    // the driver's current live cargo — a destructive no-op. See Bug 4
    // in the worklog.
    if (itemsToPromote.length === 0) {
      return loads.filter((l) => l.driverId === driverId);
    }

    const newCargo: CargoItem[] = itemsToPromote.map((item) => ({
      id: generateId(),
      driverId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }));

    // Optimistic local state update: remove old loads for this driver, add new.
    setLoads((prev) => [
      ...prev.filter((l) => l.driverId !== driverId),
      ...newCargo,
    ]);

    // DB: atomically replace the driver's loads.
    await replaceDriverLoads(driverId, newCargo);

    // Promoting a historical snapshot to live IS a cargo edit — latch the
    // "cargo edited today" flag so today's title becomes "الحمولة الحالية".
    // Only latches when the promotion targets the current driver (the
    // company-dashboard case where `driverId === currentDriverId`); the
    // company dashboard is read-only and never calls this with another
    // driver's id, but we guard anyway for safety.
    if (driverId === currentDriverId) {
      markCargoEditedToday();
    }

    return newCargo;
  };

  // ── Sales ─────────────────────────────────────────────────────────────────

  const addSale = (items: SaleLineItem[], receiptImageUrl?: string | null) => {
    if (!currentDriverId) return;

    // Capture pre-mutation cargo so the finalize call below freezes yesterday's
    // EOD state, not the post-sale (decremented) state. UI updates synchronously.
    const preMutationCargo = loads.filter((l) => l.driverId === currentDriverId);

    setLoads((prev) =>
      prev.map((load) => {
        if (load.driverId !== currentDriverId) return load;
        const soldItem = items.find(
          (i) => i.productName.trim().toLowerCase() === load.productName.trim().toLowerCase()
        );
        if (!soldItem) return load;
        const newQty = Math.max(0, load.quantity - soldItem.quantity);
        void decrementLoad(currentDriverId, load.productName, soldItem.quantity);
        return { ...load, quantity: newQty };
      })
    );

    // Finalize yesterday's snapshot AFTER local state update, using captured
    // pre-mutation state. Fire-and-forget — idempotent. Must come before the
    // createSale call so yesterday's EOD is frozen before today's first sale
    // is recorded, but it doesn't need to be awaited (the snapshot insert is
    // independent of the sale insert; both are async DB writes).
    void finalizeYesterdayIfNeeded(currentDriverId, preMutationCargo);

    const totalPrice = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    // Baghdad local date (UTC+3, no DST). en-CA → 'YYYY-MM-DD'.
    // Previously used UTC which mis-stamped sales made between 00:00–03:00 Baghdad.
    const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });

    const newSale: SaleRecord = {
      id: generateId(),
      driverId: currentDriverId,
      date,
      items,
      totalPrice,
      receiptImageUrl: receiptImageUrl ?? null,
    };
    setSales((prev) => [newSale, ...prev]);
    void createSale(newSale.id, currentDriverId, date, items, totalPrice, receiptImageUrl ?? null);

    // ── Notify company owner via FCM Edge Function ────────────────────────
    // The driver's app (which is open) calls the Edge Function, which sends
    // an FCM Web Push to the company owner's device. This works even when
    // the company app/PWA is completely closed.
    if (isFirebaseConfigured && role === 'driver' && authCompanyId) {
      const driverName = driversRef.current.find((d) => d.id === currentDriverId)?.name || '';
      void notifySaleViaEdgeFunction(
        newSale.id,
        currentDriverId,
        driverName,
        totalPrice,
        authCompanyId,
      );
    }

    // Per the revised midnight-logic spec, a sale IS a cargo mutation —
    // it decrements live quantities. Latch the "cargo edited today" flag
    // so the Day-2 carry-over title flips from "الحمولة المتبقية من اليوم
    // السابق" to "الحمولة الحالية" on the first sale of the day.
    markCargoEditedToday();
  };

  // When enabled: request permission + register FCM token + save to Supabase.
  // If token registration FAILS, the toggle flips back OFF — deterministic.
  const enableNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }

    // Request browser notification permission
    const permission = await fcmRequestPermission();
    setNotificationPermission(permission);

    if (permission === 'granted') {
      // Optimistically enable — will revert if token registration fails
      setNotificationsEnabled(true);
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, '1');

      // Register FCM token — AWAIT the result (not fire-and-forget)
      if (isFirebaseConfigured && role === 'company' && authCompanyId) {
        const token = await registerFcmToken(authCompanyId);
        if (!token) {
          // Token registration failed — revert toggle to OFF
          setNotificationsEnabled(false);
          localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, '0');
        }
      }
    } else {
      // Denied or dismissed — keep the toggle off.
      setNotificationsEnabled(false);
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, '0');
    }
  };

  // When disabled: remove FCM token from Supabase (stop push delivery).
  const disableNotifications = () => {
    setNotificationsEnabled(false);
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, '0');

    // Remove FCM token so the Edge Function stops sending push to this device
    if (isFirebaseConfigured && role === 'company' && authCompanyId) {
      void unregisterFcmToken(authCompanyId);
    }
  };

  // ── FCM foreground message handler ──────────────────────────────────────
  // When the page IS in the foreground, FCM delivers messages to the
  // onMessage callback instead of the service worker's onBackgroundMessage.
  // We show a notification via SW's showNotification() (not new Notification)
  // to keep it branded as "TrackTracker" and avoid the Chrome/TrackTracker
  // duplicate issue.
  useEffect(() => {
    if (role !== 'company' || !authCompanyId) return;
    if (!isFirebaseConfigured || !notificationsEnabled) return;

    let unsubscribe: (() => void) | null = null;

    void (async () => {
      const messaging = await getFirebaseMessaging();
      if (!messaging) return;

      const { onMessage } = await import('firebase/messaging');

      unsubscribe = onMessage(messaging, (payload) => {
        const data = payload.data || {};
        const saleId = data.saleId || '';
        const type = data.type || '';

        // Only handle sale notifications
        if (type !== 'sale') return;

        // Dedup guard — skip if we already notified for this sale
        const now = Date.now();
        const DEDUP_TTL = 5 * 60 * 1000;
        const dedupMap = notifiedSaleIdsRef.current;
        if (saleId && dedupMap.has(saleId)) {
          return;
        }
        // Expire old entries
        for (const [id, ts] of dedupMap) {
          if (now - ts > DEDUP_TTL) dedupMap.delete(id);
        }
        if (saleId) dedupMap.set(saleId, now);

        const title = data.title || 'عملية بيع جديدة';
        const body = data.body || 'تم تسجيل عملية بيع جديدة';
        const icon = data.icon || `${import.meta.env.BASE_URL}icons/icon-192.png`;
        // ALWAYS use sale-based tag for dedup — never Date.now()
        const tag = `sale-${saleId}`;

        // Use SW showNotification() — single "TrackTracker"-branded notification
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then((reg) => {
            reg.showNotification(title, { body, icon, tag, data: { saleId, type, clickAction: '/' }, dir: 'rtl', lang: 'ar' });
          }).catch(() => {
            try { new Notification(title, { body, icon, tag }); } catch {}
          });
        } else {
          try { new Notification(title, { body, icon, tag }); } catch {}
        }
      });
    })();

    return () => { unsubscribe?.(); };
  }, [role, authCompanyId, notificationsEnabled]);

  // ── FCM token refresh on visibility change ────────────────────────────────
  // When the app regains focus (e.g., user returns to the tab), re-register
  // the FCM token to handle token rotation by the browser/Firebase.
  useEffect(() => {
    if (role !== 'company' || !authCompanyId) return;
    if (!isFirebaseConfigured || !notificationsEnabled) return;

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshFcmTokenIfNeeded(authCompanyId);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [role, authCompanyId, notificationsEnabled]);

  // ── Re-register FCM token on login/refresh ──────────────────────────────
  // When a company owner logs in or refreshes, ensure their FCM token is
  // still registered (handles token expiry, browser update, etc.).
  // Also fires when notificationsEnabled flips to true (user enables toggle).
  useEffect(() => {
    if (role !== 'company' || !authCompanyId) return;
    if (!isFirebaseConfigured || !notificationsEnabled) return;
    if (fcmGetPermission() !== 'granted') return;

    // Re-register token on mount (handles refresh/login)
    void registerFcmToken(authCompanyId);
  }, [role, authCompanyId, notificationsEnabled]);

  // ── Supabase Realtime for UI updates ONLY (no notifications) ─────────────
  // Realtime is still used to update the sales list in real-time, but
  // it does NOT display notifications — FCM handles all notifications.
  useEffect(() => {
    if (role !== 'company' || !authCompanyId) return;
    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel(`company-sales-realtime-${authCompanyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sales' },
        (payload) => {
          // Intentionally NOT showing a notification here.
          // FCM + Edge Function handles all sale notifications.
          // Realtime is only for live UI updates (the sales list refreshes
          // automatically when a new sale is inserted).
          console.log('[AppContext] Realtime: new sale detected (UI update only, no notification)');
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [role, authCompanyId]);

  const currentDriver = drivers.find((d) => d.id === currentDriverId) ?? null;

  return (
    <AppContext.Provider
      value={{
        company,
        darkMode,
        toggleDarkMode,
        updateLogo,
        setCompanyProfile,
        setJoinCode,
        regenerateJoinCode,
        logout,
        activateSubscription,
        companySubscriptionActive: role === 'driver'
          ? driverCompanySubscriptionActive
          : company.subscriptionActive,
        drivers,
        loads,
        sales,
        currentDriverId,
        currentDriver,
        logoutDriver,
        updateDriverProfile,
        upsertLoad,
        removeLoad,
        promoteSnapshotToLive,
        addSale,
        cargoEditedToday,
        notificationsEnabled,
        notificationPermission,
        enableNotifications,
        disableNotifications,
        fcmRegStatus,
        fcmRegError,
        fcmDiagnostics: fcmDiagnosticsState,
        sendTestFcmNotification: async () => {
          if (!authCompanyId) return { success: false, message: 'Not logged in' };
          return sendTestNotification(authCompanyId);
        },
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
