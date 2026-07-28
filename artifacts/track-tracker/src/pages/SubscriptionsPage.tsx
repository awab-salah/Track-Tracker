import { useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowRight, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MobileLayout } from '@/layouts/MobileLayout';
import { AppInput } from '@/components/AppInput';
import { AppButton } from '@/components/AppButton';
import { PromoCodeSection } from '@/components/PromoCodeSection';
import { SubscriptionPlanCard } from '@/components/SubscriptionPlanCard';
import { SUBSCRIPTION_PLANS, subscribeToPlan } from '@/services/subscriptionService';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/hooks/use-toast';

/**
 * SubscriptionsPage — Company Owner only.
 *
 * Displays an activation code input, promo code section, and subscription
 * plan cards. The activation code input is the ONLY place where the owner
 * can enter a code to activate their subscription.
 */
export default function SubscriptionsPage() {
  const [, setLocation] = useLocation();
  const { activateSubscription } = useApp();
  const { toast } = useToast();

  // ── Activation code state ──
  const [activationCode, setActivationCode] = useState('');
  const [activationLoading, setActivationLoading] = useState(false);
  const [activationError, setActivationError] = useState('');

  const handleActivate = async () => {
    const code = activationCode.trim();
    if (!code) {
      setActivationError('الرجاء إدخال كود التفعيل');
      return;
    }
    setActivationError('');
    setActivationLoading(true);
    try {
      const success = await activateSubscription(code);
      if (success) {
        toast({ title: 'تم تفعيل الاشتراك بنجاح!' });
        setActivationCode('');
      } else {
        setActivationError('كود التفعيل غير صحيح');
      }
    } catch {
      setActivationError('حدث خطأ، حاول مرة أخرى');
    } finally {
      setActivationLoading(false);
    }
  };

  const handleSubscribe = async (planId: string) => {
    // TODO: implement backend flow (payment gateway, etc.)
    const result = await subscribeToPlan(planId);
    if (!result.success) {
      // For now, the stub always returns this — no-op
      return;
    }
  };

  const handlePromoApplied = (_benefit: string) => {
    // TODO: apply promo benefit (e.g. "أول شهر مجاني")
  };

  return (
    <MobileLayout>
      <div className="flex flex-col flex-1 h-[100dvh]">

        {/* ── Header ── */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-background shrink-0">
          <div className="w-10" /> {/* Spacer for centering */}
          <span className="font-bold text-base text-foreground">الاشتراكات</span>
          <button
            onClick={() => setLocation('/profile')}
            className="w-10 h-10 flex items-center justify-center rounded-full
                       hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <ArrowRight size={22} className="text-foreground" />
          </button>
        </header>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 flex flex-col gap-4 py-6">

            {/* ── Activation code section ── */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4
                            shadow-[0_2px_12px_rgba(0,0,0,0.06)]
                            border border-black/[0.04] dark:border-white/[0.06]">
              <p className="text-xs text-muted-foreground font-semibold mb-3">كود التفعيل</p>
              <div className="flex flex-col gap-2">
                <AppInput
                  value={activationCode}
                  onChange={(e) => {
                    setActivationCode(e.target.value);
                    setActivationError('');
                  }}
                  placeholder="أدخل كود التفعيل"
                  dir="ltr"
                  data-testid="input-activation-code"
                />
                <AppButton
                  onClick={handleActivate}
                  disabled={activationLoading}
                  data-testid="btn-activate"
                >
                  {activationLoading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      جارٍ التحقق...
                    </>
                  ) : 'تفعيل'}
                </AppButton>

                <AnimatePresence>
                  {activationError && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-xs text-red-500 text-center font-medium"
                    >
                      {activationError}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Promo code section */}
            <PromoCodeSection onApplied={handlePromoApplied} />

            {/* Subscription plan cards */}
            {SUBSCRIPTION_PLANS.map((plan, index) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08, duration: 0.3 }}
              >
                <SubscriptionPlanCard
                  plan={plan}
                  onSubscribe={handleSubscribe}
                />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </MobileLayout>
  );
}
