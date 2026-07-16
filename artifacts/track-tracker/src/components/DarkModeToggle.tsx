import { Moon, Sun } from 'lucide-react';
import { useApp } from '@/store/AppContext';

/**
 * Shared dark-mode toggle row used on every Profile page (Company & Driver).
 * Reads/writes the single global `darkMode` flag in AppContext, so flipping
 * it here automatically applies `.dark` on <html> and affects every page —
 * existing and future — that uses the app's `dark:` Tailwind classes.
 */
export function DarkModeToggle() {
  const { darkMode, toggleDarkMode } = useApp();

  return (
    <div className="flex items-center justify-between px-4 py-4">
      {/* ── Toggle — fixed RTL positioning via CSS left (not framer x) ── */}
      <button
        onClick={toggleDarkMode}
        className="relative w-12 h-6 rounded-full shrink-0 overflow-hidden
                   transition-colors duration-300 focus:outline-none
                   focus-visible:ring-2 focus-visible:ring-primary"
        style={{ background: darkMode ? '#0D4D5A' : '#E5E7EB' }}
        aria-checked={darkMode}
        aria-label="تفعيل الوضع الليلي"
        role="switch"
        data-testid="toggle-darkmode"
      >
        {/* Knob anchored at left:4px; translateX keeps it inside the
            48px-wide/24px-tall track at both ends (4px + 16px knob = 20px,
            4px + 24px translate + 16px knob = 44px — both within 48px). */}
        <span
          className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-md
                     transition-transform duration-300 ease-in-out will-change-transform"
          style={{ transform: darkMode ? 'translateX(24px)' : 'translateX(0px)' }}
        />
      </button>

      {/* Label */}
      <div className="flex items-center gap-2">
        {darkMode
          ? <Moon size={18} className="text-primary" />
          : <Sun size={18} className="text-muted-foreground" />}
        <span className="font-semibold text-foreground">الوضع الليلي</span>
      </div>
    </div>
  );
}
