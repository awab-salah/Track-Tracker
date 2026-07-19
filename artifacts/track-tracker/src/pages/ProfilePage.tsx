import { useState } from 'react';
import { ArrowRight, RefreshCw, LogOut, Moon, Sun, Bell, BellOff, Camera, Copy, Check, Edit3, X, ChevronLeft } from 'lucide-react';
import { AppInput } from '@/components/AppInput';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { MobileLayout } from '@/layouts/MobileLayout';
import { Logo } from '@/components/Logo';
import { AppButton } from '@/components/AppButton';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useApp } from '@/store/AppContext';

// ── helpers ──────────────────────────────────────────────────────────────────

function generatePreviewCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ── JoinCode bottom-sheet ─────────────────────────────────────────────────────

function JoinCodeSheet({
  visible,
  currentCode,
  onClose,
  onSave,
}: {
  visible: boolean;
  currentCode: string;
  onClose: () => void;
  onSave: (code: string) => void;
}) {
  const [tab, setTab] = useState<'random' | 'custom'>('random');
  const [preview, setPreview] = useState(generatePreviewCode);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');

  const handleSave = () => {
    if (tab === 'random') {
      onSave(preview);
      onClose();
      return;
    }
    const code = custom.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) {
      setError('الرمز يجب أن يكون 6 خانات بالضبط');
      return;
    }
    if (code === currentCode) {
      setError('هذا هو الرمز الحالي، اختر رمزاً مختلفاً');
      return;
    }
    onSave(code);
    onClose();
  };

  const handleTabChange = (v: string) => {
    setTab(v as 'random' | 'custom');
    setError('');
    setCustom('');
  };

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* ── Backdrop ── */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />

          {/* ── Sheet ── */}
          <motion.div
            key="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50
                       bg-white dark:bg-zinc-900 rounded-t-3xl pt-4 pb-safe"
            style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
          >
            {/* handle */}
            <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-5" />

            <div className="px-5">
              <h3 className="font-extrabold text-lg text-foreground mb-5 text-center">
                تغيير رمز الانضمام
              </h3>

              {/* Tab selector */}
              <SegmentedControl
                options={[
                  { label: 'رمز عشوائي', value: 'random' },
                  { label: 'رمز مخصص', value: 'custom' },
                ]}
                value={tab}
                onChange={handleTabChange}
              />

              <div className="mt-6 min-h-[120px] flex flex-col items-center justify-center">
                {tab === 'random' ? (
                  <>
                    <motion.span
                      key={preview}
                      initial={{ scale: 0.75, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-4xl font-extrabold tracking-[0.25em] mb-4"
                      style={{ color: '#0D3B4A' }}
                    >
                      {preview}
                    </motion.span>
                    <button
                      onClick={() => setPreview(generatePreviewCode())}
                      className="flex items-center gap-2 text-sm font-semibold text-muted-foreground
                                 hover:text-foreground transition-colors"
                    >
                      <RefreshCw size={13} />
                      توليد رمز آخر
                    </button>
                  </>
                ) : (
                  <div className="w-full flex flex-col gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      value={custom}
                      dir="ltr"
                      inputMode="text"
                      autoCapitalize="characters"
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(e) => {
                        setCustom(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                        setError('');
                      }}
                      placeholder="مثال: A9K2P7"
                      className="w-full h-14 rounded-2xl border border-input px-4
                                 text-xl font-bold text-center tracking-widest outline-none
                                 bg-white dark:bg-zinc-800 dark:border-zinc-700
                                 text-foreground dark:text-white dark:[color-scheme:dark]
                                 placeholder:text-muted-foreground
                                 focus:border-primary focus:ring-1 focus:ring-primary
                                 transition-all"
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      6 خانات: أرقام وحروف إنجليزية فقط
                    </p>
                    <AnimatePresence>
                      {error && (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="text-xs text-red-500 text-center font-medium"
                        >
                          {error}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              <div className="mt-6">
                <AppButton onClick={handleSave}>حفظ الرمز</AppButton>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [, setLocation] = useLocation();
  const {
    company,
    darkMode,
    toggleDarkMode,
    updateLogo,
    setJoinCode,
    setCompanyProfile,
    logout,
    notificationsEnabled,
    notificationPermission,
    enableNotifications,
    disableNotifications,
  } = useApp();
  const [copied, setCopied] = useState(false);
  const [showCodeSheet, setShowCodeSheet] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');

  const startEdit = () => {
    setEditName(company.name);
    setEditEmail(company.email);
    setIsEditing(true);
  };

  const cancelEdit = () => setIsEditing(false);

  const saveEdit = () => {
    if (!editName.trim()) return;
    setCompanyProfile({ name: editName.trim(), email: editEmail.trim() });
    setIsEditing(false);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    updateLogo(URL.createObjectURL(file));
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(company.joinCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleNotifications = () => {
    if (notificationsEnabled) {
      disableNotifications();
    } else {
      void enableNotifications();
    }
  };

  return (
    <MobileLayout>
      <div className="flex flex-col flex-1 h-[100dvh]">

        {/* ── Header ── */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-background shrink-0">
          {isEditing ? (
            <button
              onClick={cancelEdit}
              className="w-10 h-10 flex items-center justify-center rounded-full
                         hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              data-testid="btn-cancel-edit"
            >
              <X size={22} className="text-foreground" />
            </button>
          ) : (
            <button
              onClick={() => setLocation('/owner-dashboard')}
              className="w-10 h-10 flex items-center justify-center rounded-full
                         hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              data-testid="btn-back"
            >
              <ArrowRight size={22} className="text-foreground" />
            </button>
          )}
          <span className="font-bold text-base text-foreground">الملف الشخصي</span>
          {isEditing ? (
            <button
              onClick={saveEdit}
              className="w-10 h-10 flex items-center justify-center rounded-full
                         hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              data-testid="btn-save-company-profile"
            >
              <Check size={22} className="text-primary" />
            </button>
          ) : (
            <button
              onClick={startEdit}
              className="w-10 h-10 flex items-center justify-center rounded-full
                         hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              data-testid="btn-edit-company-profile"
            >
              <Edit3 size={18} className="text-muted-foreground" />
            </button>
          )}
        </header>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Avatar section */}
          <div className="flex flex-col items-center pt-8 pb-6 px-6">
            <div className="relative mb-5">
              <div className="w-24 h-24 rounded-full border-[3px] border-primary/25 bg-primary/10
                              flex items-center justify-center overflow-hidden
                              shadow-[0_4px_20px_rgba(13,77,90,0.15)]">
                {company.logoUrl ? (
                  <img
                    src={company.logoUrl}
                    alt="شعار الشركة"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Logo size="sm" showText={false} />
                )}
              </div>

              {/* label activates the file input natively — works in sandboxed iframes */}
              <motion.label
                htmlFor="input-logo"
                whileTap={{ scale: 0.88 }}
                className="absolute bottom-0 left-0 w-8 h-8 rounded-full flex items-center
                           justify-center border-2 border-white shadow-md cursor-pointer"
                style={{ background: '#C97A56' }}
              >
                <Camera size={13} color="white" />
              </motion.label>
              <input
                id="input-logo"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoChange}
                data-testid="input-logo"
              />
            </div>

            {isEditing ? (
              <div className="w-full flex flex-col gap-3 mt-3">
                <AppInput
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="اسم الشركة"
                  type="text"
                  data-testid="input-edit-company-name"
                />
                <AppInput
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="البريد الإلكتروني"
                  type="email"
                  data-testid="input-edit-company-email"
                />
              </div>
            ) : (
              <>
                <h2 className="font-extrabold text-xl text-foreground">{company.name}</h2>
                <p className="text-sm text-muted-foreground mt-1">{company.email}</p>
              </>
            )}
          </div>

          {/* Info & actions */}
          <div className="px-4 flex flex-col gap-4 pb-10">

            {/* ── Join code card ── */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4
                            shadow-[0_2px_12px_rgba(0,0,0,0.06)]
                            border border-black/[0.04] dark:border-white/[0.06]">
              <p className="text-xs text-muted-foreground font-semibold mb-3">رمز الانضمام</p>

              <div className="flex items-center justify-between">
                {/* Actions — left side in RTL (second child) */}
                <div className="flex items-center gap-2">
                  {/* Copy */}
                  <motion.button
                    whileTap={{ scale: 0.88 }}
                    onClick={handleCopy}
                    className="w-9 h-9 rounded-xl bg-muted hover:bg-muted/80 flex items-center
                               justify-center transition-colors"
                    title="نسخ الرمز"
                  >
                    {copied
                      ? <Check size={16} className="text-green-500" />
                      : <Copy size={16} className="text-muted-foreground" />}
                  </motion.button>

                  {/* Change code — opens the sheet */}
                  <motion.button
                    whileTap={{ scale: 0.88 }}
                    onClick={() => setShowCodeSheet(true)}
                    className="w-9 h-9 rounded-xl bg-muted hover:bg-muted/80 flex items-center
                               justify-center transition-colors"
                    title="تغيير الرمز"
                    data-testid="btn-change-code"
                  >
                    <Edit3 size={16} className="text-muted-foreground" />
                  </motion.button>
                </div>

                {/* Code display — right side in RTL (first child) */}
                <motion.span
                  key={company.joinCode}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-2xl font-extrabold tracking-[0.2em]"
                  style={{ color: '#0D3B4A' }}
                >
                  {company.joinCode}
                </motion.span>
              </div>
            </div>

            {/* ── Subscriptions card ── */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => setLocation('/subscriptions')}
              className="w-full bg-white dark:bg-zinc-900 rounded-2xl p-4
                         shadow-[0_2px_12px_rgba(0,0,0,0.06)]
                         border border-black/[0.04] dark:border-white/[0.06]
                         flex items-center justify-between
                         transition-shadow duration-300
                         hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)]"
              data-testid="btn-subscriptions"
            >
              <ChevronLeft size={18} className="text-muted-foreground" />
              <span className="font-semibold text-foreground">الاشتراكات</span>
            </motion.button>

            {/* ── Settings card ── */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden
                            shadow-[0_2px_12px_rgba(0,0,0,0.06)]
                            border border-black/[0.04] dark:border-white/[0.06]">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-xs text-muted-foreground font-semibold">الإعدادات</p>
              </div>

              {/* Dark mode row */}
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
                  <span
                    className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-md
                               transition-all duration-300 ease-in-out"
                    style={{ left: darkMode ? '26px' : '2px' }}
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

              {/* Sale notifications row */}
              <div className="flex items-center justify-between px-4 py-4 border-t border-border">
                <button
                  onClick={handleToggleNotifications}
                  className="relative w-12 h-6 rounded-full shrink-0 overflow-hidden
                             transition-colors duration-300 focus:outline-none
                             focus-visible:ring-2 focus-visible:ring-primary"
                  style={{ background: notificationsEnabled ? '#0D4D5A' : '#E5E7EB' }}
                  aria-checked={notificationsEnabled}
                  aria-label="تفعيل إشعارات المبيعات"
                  role="switch"
                  data-testid="toggle-notifications"
                >
                  <span
                    className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-md
                               transition-all duration-300 ease-in-out"
                    style={{ left: notificationsEnabled ? '26px' : '2px' }}
                  />
                </button>

                <div className="flex items-center gap-2">
                  {notificationsEnabled
                    ? <Bell size={18} className="text-primary" />
                    : <BellOff size={18} className="text-muted-foreground" />}
                  <span className="font-semibold text-foreground">إشعارات المبيعات</span>
                </div>
              </div>

              {notificationPermission === 'denied' && (
                <p className="px-4 pb-4 -mt-2 text-xs text-red-500 leading-relaxed">
                  الإشعارات محظورة من إعدادات المتصفح. لتفعيلها، اسمح بالإشعارات لهذا الموقع من إعدادات المتصفح ثم أعد المحاولة.
                </p>
              )}

              {notificationPermission === 'unsupported' && (
                <p className="px-4 pb-4 -mt-2 text-xs text-muted-foreground leading-relaxed">
                  متصفحك لا يدعم إشعارات الويب.
                </p>
              )}
            </div>

            {/* ── Logout ── */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 rounded-2xl py-4
                         font-bold text-base transition-colors"
              style={{
                background: 'rgba(239,68,68,0.08)',
                color: '#DC2626',
                border: '1.5px solid rgba(239,68,68,0.15)',
              }}
              data-testid="btn-logout"
            >
              <LogOut size={18} />
              تسجيل الخروج
            </motion.button>
          </div>
        </div>
      </div>

      {/* ── Join code bottom sheet — rendered outside scroll container ── */}
      <JoinCodeSheet
        visible={showCodeSheet}
        currentCode={company.joinCode}
        onClose={() => setShowCodeSheet(false)}
        onSave={(code) => setJoinCode(code)}
      />
    </MobileLayout>
  );
}
