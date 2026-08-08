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
import { messaging, isFcmAvailable } from '@/lib/firebase';
import { onMessage } from 'firebase/messaging';
import {
  requestFcmToken,
  removeFcmToken,
  notifySaleViaEdgeFunction,
} from '@/services/fcmService';

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

  /**
   * Whether AppContext has finished its initial bootstrap fetch.
   * - For company owners: true once drivers/loads/sales have been fetched.
   * - For drivers: true once the driver profile and company subscription
   *   have been fetched.
   * - False during the gap between auth resolving (isLoading=false) and
   *   AppContext's bootstrap useEffect completing its async fetch.
   *   During this gap, `drivers` may be empty even for a company that has
   *   drivers — so "driver not found" must NOT be shown until this is true.
   */
  isBootstrapped: boolean;
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

  // ── Bootstrap completed flag ───────────────────────────────────────────────
  // True once the initial bootstrap fetch (company or driver) has finished.
  // Used by DriverDetails to avoid flashing "driver not found" while the
  // drivers[] array is still being populated.
  const [isBootstrapped, setIsBootstrapped] = useState(false);

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

  // ── Sale notifications ────────────────────────────────────────────────────
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) === '1'
  );
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(getNotificationPermission);

  // Kept in a ref (not a dependency of the subscription effect below) so that
  // routine driver-list refreshes don't tear down and re-create the realtime
  // channel — only role/company/toggle changes should do that.
  const driversRef = useRef<Driver[]>(drivers);
  useEffect(() => {
    driversRef.current = drivers;
  }, [drivers]);

  // ── FCM token ref ────────────────────────────────────────────────────────
  // Stores the current FCM token so we can clean it up on disable/logout.
  const fcmTokenRef = useRef<string | null>(null);

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
      setIsBootstrapped(true);
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
      setIsBootstrapped(true);

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
      setIsBootstrapped(true);
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
      setIsBootstrapped(true);

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
      setIsBootstrapped(false);
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
    // ── FCM: clean up push token on company logout ───────────────────────
    if (authCompanyId) {
      void removeFcmToken(authCompanyId);
      fcmTokenRef.current = null;
    }
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

    // ── FCM: notify company owner via Edge Function ───────────────────────
    // Fire-and-forget. The sale is already persisted locally and to Supabase.
    // The push notification is a best-effort add-on that ensures the company
    // owner gets notified even if their browser tab is closed.
    // Only drivers create sales, so we use authDriverProfile.companyId.
    if (authDriverProfile?.companyId) {
      const driverName = authDriverProfile.name || 'سائق';
      console.log('[AppContext] Sale created, invoking notify-sale for company', authDriverProfile.companyId);
      void notifySaleViaEdgeFunction(
        newSale.id,
        currentDriverId,
        driverName,
        totalPrice,
        authDriverProfile.companyId
      );
    } else {
      console.warn('[AppContext] Cannot notify company: authDriverProfile.companyId is missing');
    }

    // Per the revised midnight-logic spec, a sale IS a cargo mutation —
    // it decrements live quantities. Latch the "cargo edited today" flag
    // so the Day-2 carry-over title flips from "الحمولة المتبقية من اليوم
    // السابق" to "الحمولة الحالية" on the first sale of the day.
    markCargoEditedToday();
  };

  // Only asks for browser permission when the owner explicitly enables the
  // toggle (never on load / never automatically).
  const enableNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }

    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    setNotificationPermission(permission);

    if (permission === 'granted') {
      setNotificationsEnabled(true);
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, '1');

      // ── FCM: register push token ───────────────────────────────────────
      // After permission is granted, also request an FCM token for push
      // notifications when the app is in the background.
      if (authCompanyId) {
        console.log('[AppContext] Notification permission granted, registering FCM token for company', authCompanyId);
        const token = await requestFcmToken(authCompanyId);
        if (token) {
          fcmTokenRef.current = token;
          console.log('[AppContext] FCM token registered successfully');
        } else {
          console.warn('[AppContext] FCM token registration failed — background push will not work. Foreground (Realtime) notifications will still work.');
        }
      } else {
        console.warn('[AppContext] Cannot register FCM token: authCompanyId is null');
      }
    } else {
      // Denied or dismissed — keep the toggle off.
      console.warn('[AppContext] Notification permission not granted:', permission);
      setNotificationsEnabled(false);
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, '0');
    }
  };

  const disableNotifications = () => {
    setNotificationsEnabled(false);
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, '0');

    // ── FCM: remove push token ─────────────────────────────────────────
    // Remove the FCM token from the DB so the Edge Function stops
    // sending push to this device. Fire-and-forget.
    if (authCompanyId) {
      void removeFcmToken(authCompanyId);
      fcmTokenRef.current = null;
    }
  };

  // ── Sale notifications — Supabase Realtime subscription ───────────────────
  // Keeps the channel open so that future features (e.g. auto-refreshing the
  // sales list) can use it, but does NOT display a notification here.
  // FCM (foreground onMessage + background service worker) now handles all
  // sale notifications. Previously this Realtime handler also called
  // new Notification(), which caused duplicate notifications when FCM was
  // enabled — the same sale would trigger both this Realtime notification
  // AND the FCM onMessage notification.
  useEffect(() => {
    if (role !== 'company' || !authCompanyId) return;
    if (!isSupabaseConfigured || !notificationsEnabled) return;
    if (getNotificationPermission() !== 'granted') return;

    const channel = supabase
      .channel(`company-sales-notify-${authCompanyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sales' },
        () => {
          // Intentionally not showing a notification here.
          // FCM handles both foreground (onMessage) and background
          // (service worker) sale notifications. This Realtime channel
          // is kept open for potential future use (e.g. sales list refresh).
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [role, authCompanyId, notificationsEnabled]);

  // ── FCM: re-register push token on page load ────────────────────────────────
  // When the company owner refreshes the page (or returns later), the
  // notificationsEnabled flag is restored from localStorage, but the FCM
  // push token is NOT re-registered because enableNotifications() is only
  // called when the user clicks the toggle. Without this effect, background
  // push notifications silently break on every page refresh because no
  // token exists in the fcm_tokens table for the Edge Function to find.
  useEffect(() => {
    if (role !== 'company' || !authCompanyId) return;
    if (!notificationsEnabled) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    // Re-register the FCM token (idempotent — upsert with onConflict).
    // This ensures the token is always in the DB even after a page refresh.
    let cancelled = false;
    void (async () => {
      try {
        const token = await requestFcmToken(authCompanyId);
        if (cancelled) return;
        if (token) {
          fcmTokenRef.current = token;
          console.log('[AppContext] FCM token re-registered on page load');
        } else {
          console.warn('[AppContext] FCM token registration returned null — push notifications may not work in background');
        }
      } catch (err) {
        console.error('[AppContext] FCM token re-registration failed:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [role, authCompanyId, notificationsEnabled]);

  // ── FCM foreground message listener ────────────────────────────────────────
  // When a push message arrives while the app is in the foreground, FCM
  // does NOT auto-show a notification (data-only messages never auto-show).
  // We listen via `onMessage` and show a Notification manually, using the
  // saleId from payload.data as the notification tag for browser-level dedup.
  //
  // Deduplication: a Map of sale ID → notify-timestamp prevents duplicate
  // notifications even if FCM re-delivers the same message (e.g. on
  // reconnect). Entries older than 5 minutes are pruned to bound memory.
  const notifiedSaleIdsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (role !== 'company' || !notificationsEnabled) return;
    if (getNotificationPermission() !== 'granted') return;

    // Check if FCM is available before attaching the listener.
    // isFcmAvailable() is async, so we use an IIFE pattern.
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      const available = await isFcmAvailable();
      if (cancelled || !available || !messaging) return;

      try {
        unsubscribe = onMessage(messaging, (payload) => {
          // Data-only messages: title/body/icon are in payload.data.
          // (We no longer send a `notification` key from the Edge Function,
          //  but handle it defensively in case of legacy messages.)
          const saleId = (payload.data?.saleId as string) || '';
          const title = payload.notification?.title || payload.data?.title || 'عملية بيع جديدة';
          const body = payload.notification?.body || payload.data?.body || '';
          const icon = payload.notification?.icon || payload.data?.icon || `${import.meta.env.BASE_URL}icons/icon-192.png`;

          // ── Dedup guard ──
          // If we already notified for this sale, skip. Also prune stale
          // entries (older than 5 minutes) to prevent unbounded growth.
          const now = Date.now();
          const DEDUP_TTL = 5 * 60 * 1000;
          const dedupMap = notifiedSaleIdsRef.current;

          if (saleId && dedupMap.has(saleId)) {
            console.log('[AppContext] Skipping duplicate FCM notification for sale:', saleId);
            return;
          }

          // Prune stale entries.
          for (const [id, ts] of dedupMap) {
            if (now - ts > DEDUP_TTL) dedupMap.delete(id);
          }

          if (saleId) dedupMap.set(saleId, now);

          try {
            new Notification(title, {
              body,
              icon,
              // Use saleId in the tag for browser-level dedup: if a
              // notification with the same tag is already visible, the
              // browser replaces it instead of showing a second one.
              tag: saleId ? `sale-${saleId}` : `sale-${Date.now()}`,
            });
          } catch (err) {
            console.error('[AppContext] Failed to display FCM foreground notification:', err);
          }
        });
      } catch (err) {
        console.warn('[AppContext] Failed to attach FCM onMessage listener:', err);
      }
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [role, notificationsEnabled]);

  // ── Derive currentDriver ────────────────────────────────────────────────────
  // PRIMARY: from drivers[] state (populated by bootstrap useEffect).
  // FALLBACK: from authDriverProfile (available synchronously from AuthContext).
  //
  // Without the fallback, there is a timing gap between AuthProvider resolving
  // auth (role='driver', isLoading=false) and AppContext's bootstrap useEffect
  // populating drivers[]/currentDriverId (runs AFTER the first render). During
  // that gap, currentDriver was null, which caused DriverDashboard to either:
  //   - <Redirect> to /driver-auth → infinite loop → crash (original bug)
  //   - Show a loading spinner (previous fix — still caused ErrorBoundary to
  //     catch a render error during the transition)
  //
  // By falling back to authDriverProfile (which IS the driver profile — the
  // bootstrap useEffect sets drivers=[authDriverProfile]), currentDriver is
  // NEVER null for a logged-in driver. The timing gap is eliminated at the
  // source, and DriverDashboard renders normally from the very first render.
  const currentDriver = (() => {
    const fromState = drivers.find((d) => d.id === currentDriverId);
    if (fromState) return fromState;
    // Fallback: auth driver is signed in but bootstrap useEffect hasn't run yet.
    // authDriverProfile contains the same data that the useEffect will put in
    // drivers[] — use it directly so the driver page never sees a null driver.
    if (role === 'driver' && authDriverProfile) {
      return authDriverProfile;
    }
    if (role === 'driver' && !authDriverProfile) {
      console.error('[AppContext] currentDriver NULL — role=driver but authDriverProfile is null! This will cause a redirect loop.');
    }
    return null;
  })();

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
        isBootstrapped,
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
