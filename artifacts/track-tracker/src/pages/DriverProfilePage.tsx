import { useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { ArrowRight, LogOut, User, Pencil, Check, X } from 'lucide-react';
import { MobileLayout } from '@/layouts/MobileLayout';
import { AvatarUpload } from '@/components/AvatarUpload';
import { DarkModeToggle } from '@/components/DarkModeToggle';
import { InfoRow } from '@/components/InfoRow';
import { AppInput } from '@/components/AppInput';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/hooks/use-toast';

export default function DriverProfilePage() {
  const [, setLocation] = useLocation();
  const { currentDriver, updateDriverProfile, logoutDriver } = useApp();
  const { toast } = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editVehicle, setEditVehicle] = useState('');

  if (!currentDriver) {
    setLocation('/driver-auth');
    return null;
  }

  const startEdit = () => {
    setEditName(currentDriver.name);
    setEditEmail(currentDriver.email ?? '');
    setEditVehicle(currentDriver.vehicleNumber ?? '');
    setIsEditing(true);
  };

  const cancelEdit = () => setIsEditing(false);

  const saveEdit = () => {
    if (!editName.trim()) return;
    updateDriverProfile({
      name: editName.trim(),
      email: editEmail.trim(),
      vehicleNumber: editVehicle.trim(),
    });
    setIsEditing(false);
  };

  return (
    <MobileLayout>
      <div className="flex flex-col min-h-[100dvh]">

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
              onClick={() => setLocation('/driver-dashboard')}
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
              data-testid="btn-save-profile"
            >
              <Check size={22} className="text-primary" />
            </button>
          ) : (
            <button
              onClick={startEdit}
              className="w-10 h-10 flex items-center justify-center rounded-full
                         hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              data-testid="btn-edit-profile"
            >
              <Pencil size={18} className="text-muted-foreground" />
            </button>
          )}
        </header>

        {/* ── Scrollable content ── */}
        <div className="flex-1">

          {/* Avatar section */}
          <div className="flex flex-col items-center pt-8 pb-6 px-6">
            <AvatarUpload
              imageUrl={currentDriver.profilePictureUrl}
              kind="driver"
              onChange={(url) => {
                updateDriverProfile({ profilePictureUrl: url });
                toast({ title: 'تم تحديث الصورة الشخصية' });
              }}
              onUploadEnd={(success, errorMsg) => {
                if (!success) {
                  toast({
                    title: 'فشل رفع الصورة',
                    description: errorMsg,
                    variant: 'destructive',
                  });
                }
              }}
              placeholder={<User size={36} className="text-primary/60" />}
              alt="الصورة الشخصية"
              testId="input-avatar"
            />

            <h2 className="font-extrabold text-xl text-foreground">{currentDriver.name}</h2>
            <p className="text-sm text-muted-foreground mt-1">{currentDriver.email}</p>
          </div>

          {/* Info & actions */}
          <div className="px-4 flex flex-col gap-4 pb-10">

            {/* ── Info card ── */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4
                            shadow-[0_2px_12px_rgba(0,0,0,0.06)]
                            border border-black/[0.04] dark:border-white/[0.06]">
              <p className="text-xs text-muted-foreground font-semibold mb-3">معلومات الحساب</p>

              {isEditing ? (
                <div className="flex flex-col gap-3">
                  <AppInput
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="الاسم الثلاثي"
                    type="text"
                    data-testid="input-edit-name"
                  />
                  <AppInput
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="البريد الإلكتروني"
                    type="email"
                    data-testid="input-edit-email"
                  />
                  <AppInput
                    value={editVehicle}
                    onChange={(e) => setEditVehicle(e.target.value)}
                    placeholder="رقم السيارة"
                    type="text"
                    data-testid="input-edit-vehicle"
                  />
                  <div className="pt-1">
                    <InfoRow
                      label="الشركة"
                      value={currentDriver.companyName ?? '—'}
                      accent
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <InfoRow label="الاسم" value={currentDriver.name} />
                  <InfoRow label="البريد الإلكتروني" value={currentDriver.email ?? '—'} />
                  <InfoRow label="رقم السيارة" value={currentDriver.vehicleNumber || '—'} />
                  <InfoRow
                    label="الشركة"
                    value={currentDriver.companyName ?? '—'}
                    accent
                  />
                </div>
              )}
            </div>

            {/* ── Settings card ── */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden
                            shadow-[0_2px_12px_rgba(0,0,0,0.06)]
                            border border-black/[0.04] dark:border-white/[0.06]">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-xs text-muted-foreground font-semibold">الإعدادات</p>
              </div>

              <DarkModeToggle />
            </div>

            {/* ── Logout ── */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={logoutDriver}
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
    </MobileLayout>
  );
}
