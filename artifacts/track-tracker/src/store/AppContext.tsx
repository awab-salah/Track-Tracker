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
  fetchSales,
  createSale,
} from '@/services';
import { useAuth } from '@/store/AuthContext';
import type { CompanyProfile } from '@/types';

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

  drivers: Driver[];
  loads: CargoItem[];
  sales: SaleRecord[];
  currentDriverId: string | null;
  currentDriver: Driver | null;
  logoutDriver: () => void;
  updateDriverProfile: (data: Partial<Pick<Driver, 'name' | 'email' | 'vehicleNumber' | 'profilePictureUrl'>>) => void;
  upsertLoad: (input: { id?: string; productName: string; quantity: number; unitPrice: number }) => void;
  removeLoad: (id: string) => void;
  addSale: (items: SaleLineItem[], receiptImageUrl?: string | null) => void;

  // Sale notifications (company owner) — Web Notifications API + Supabase Realtime
  notificationsEnabled: boolean;
  notificationPermission: NotificationPermission | 'unsupported';
  enableNotifications: () => Promise<void>;
  disableNotifications: () => void;
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
};

// Local-only preference — Notification permission itself is a per-browser/device
// concept (not a company-level setting), so it is intentionally not persisted
// to Supabase. Kept in localStorage like the dark-mode toggle.
const NOTIFICATIONS_STORAGE_KEY = 'tt_notifications_enabled';

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
      return;
    }

    let cancelled = false;
    setCurrentDriverId(authDriverId);
    setDrivers([authDriverProfile]);

    void (async () => {
      const [remoteLoads, remoteSales] = await Promise.all([
        fetchLoads([authDriverId]),
        fetchSales([authDriverId]),
      ]);
      if (cancelled) return;
      setLoads(dedupeLoads(remoteLoads));
      setSales(remoteSales);
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
    }
  }, [role, authLoading]);

  // ── Dark mode toggle ──────────────────────────────────────────────────────
  const toggleDarkMode = () => setDarkMode((prev) => !prev);

  const updateLogo = (url: string) => {
    // logoUrl is a local blob URL — not persisted to DB
    setCompany((prev) => ({ ...prev, logoUrl: url }));
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
  };

  const removeLoad = (id: string) => {
    setLoads((prev) => prev.filter((l) => l.id !== id));
    void dbRemoveLoad(id);
  };

  // ── Sales ─────────────────────────────────────────────────────────────────

  const addSale = (items: SaleLineItem[], receiptImageUrl?: string | null) => {
    if (!currentDriverId) return;

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

    const totalPrice = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    const date = new Date().toISOString().split('T')[0];

    const newSale: SaleRecord = {
      id: generateId(),
      driverId: currentDriverId,
      date,
      items,
      totalPrice,
      receiptImageUrl: receiptImageUrl ?? null,
    };
    setSales((prev) => [newSale, ...prev]);
    void createSale(newSale.id, currentDriverId, date, items, totalPrice);
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
    } else {
      // Denied or dismissed — keep the toggle off.
      setNotificationsEnabled(false);
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, '0');
    }
  };

  const disableNotifications = () => {
    setNotificationsEnabled(false);
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, '0');
  };

  // ── Sale notifications — Supabase Realtime subscription ───────────────────
  // Fires a Web Notification the instant any driver in this company records a
  // new sale. Active only while: signed in as the company owner, the toggle is
  // on, and the browser permission is actually granted.
  useEffect(() => {
    if (role !== 'company' || !authCompanyId) return;
    if (!isSupabaseConfigured || !notificationsEnabled) return;
    if (getNotificationPermission() !== 'granted') return;

    const channel = supabase
      .channel(`company-sales-notify-${authCompanyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sales' },
        (payload) => {
          const row = payload.new as { driver_id: string; total_price: number };
          // sales has no company_id column — filter client-side against this
          // company's known driver ids (kept fresh via driversRef).
          const driver = driversRef.current.find((d) => d.id === row.driver_id);
          if (!driver) return;

          try {
            new Notification('عملية بيع جديدة', {
              body: `${driver.name} سجّل عملية بيع بقيمة ${formatIQD(row.total_price)}`,
              icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
              tag: `sale-${row.driver_id}-${Date.now()}`,
            });
          } catch (err) {
            console.error('[AppContext] Failed to display sale notification:', err);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [role, authCompanyId, notificationsEnabled]);

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
        drivers,
        loads,
        sales,
        currentDriverId,
        currentDriver,
        logoutDriver,
        updateDriverProfile,
        upsertLoad,
        removeLoad,
        addSale,
        notificationsEnabled,
        notificationPermission,
        enableNotifications,
        disableNotifications,
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
