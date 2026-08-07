/**
 * Capacitor-backed storage adapter for Supabase auth session persistence.
 *
 * Problem: Supabase's default `persistSession: true` uses `localStorage`,
 * which lives inside the WebView. On Android/iOS, the OS can clear
 * WebView data when the device is under memory pressure, or the WebView
 * can be destroyed and recreated on cold restart — losing the session.
 *
 * Solution: Use `@capacitor/preferences` as the backing store when
 * running on a native Capacitor platform. Preferences stores data in
 * Android SharedPreferences / iOS NSUserDefaults, which survive app
 * restarts, OS memory pressure, and WebView recreation.
 *
 * When running in a regular browser (PWA mode), this falls back to
 * `localStorage` which is perfectly reliable in that context.
 *
 * This adapter implements the Supabase `SupportedStorage` interface:
 *   getItem(key) → Promise<string | null>
 *   setItem(key, value) → Promise<void>
 *   removeItem(key) → Promise<void>
 */
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/**
 * Custom Supabase auth storage backed by Capacitor Preferences
 * on native platforms, localStorage on web.
 */
export const capacitorStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Capacitor.isNativePlatform()) {
      try {
        const { value } = await Preferences.get({ key });
        return value;
      } catch (err) {
        console.warn('[CapacitorStorage] Preferences.get failed, falling back to localStorage', err);
        return localStorage.getItem(key);
      }
    }
    return localStorage.getItem(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await Preferences.set({ key, value });
        // Also write to localStorage as a secondary fallback so the
        // Supabase SDK's internal checks (which may read localStorage
        // synchronously in some code paths) find the data.
        localStorage.setItem(key, value);
        return;
      } catch (err) {
        console.warn('[CapacitorStorage] Preferences.set failed, falling back to localStorage', err);
      }
    }
    localStorage.setItem(key, value);
  },

  async removeItem(key: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await Preferences.remove({ key });
        localStorage.removeItem(key);
        return;
      } catch (err) {
        console.warn('[CapacitorStorage] Preferences.remove failed, falling back to localStorage', err);
      }
    }
    localStorage.removeItem(key);
  },
};
