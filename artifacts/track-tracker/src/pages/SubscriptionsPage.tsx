import { useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowRight, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MobileLayout } from '@/layouts/MobileLayout';
import { AppInput } from '@/components/AppInput';
import { AppButton } from '@/components/AppButton';
import { SubscriptionPlanCard } from '@/components/SubscriptionPlanCard';
import { SUBSCRIPTION_PLANS, subscribeToPlan } from '@/services/subscriptionService';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/hooks/use-toast';

/**
 * SubscriptionsPage — Company Owner only.
 *
 * Displays a single activation code input and subscription plan cards.
 * The activation code input is the ONLY place where the owner can enter
 * a code to activate their subscription.
 */
export default function SubscriptionsPage() {
  const [, setLocation] = useLocation();
  const { activateSubscription, companySubscriptionActive, company } = useApp();
  const { toast } = useToast();

  // ── Activation code state ──
  const [activationCode, setActivationCode] = useState('');
  const [activationLoading, setActivationLoading] = useState(false);
  const [activationError, setActivationError] = useState('');
  const [activationSuccess, setActivationSuccess] = useState('');

  // ── Payment state ──
  const [paymentLoadingPlan, setPaymentLoadingPlan] = useState<string | null>(null);

  const handleActivate = async () => {
    const code = activationCode.trim();
    if (!code) {
      setActivationError('الرجاء إدخال كود التفعيل');
      return;
    }

    // If already active, show a message and do NOT activate again
    if (companySubscriptionActive) {
      setActivationError('');
      setActivationSuccess('هذا الحساب مفعّل بالفعل، لا حاجة لإدخال الكود مرة أخرى');
      return;
    }

    setActivationError('');
    setActivationSuccess('');
    setActivationLoading(true);
    try {
      const success = await activateSubscription(code);
      if (success) {
        toast({ title: 'تم تفعيل الاشتراك بنجاح!' });
        setActivationCode('');
        setActivationSuccess('تم تفعيل الاشتراك بنجاح!');
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
    // Prevent duplicate subscription purchases — if the company already has
    // an active subscription, reject immediately without calling the API.
    if (companySubscriptionActive) {
      toast({ title: 'اشتراكك مفعل بالفعل', description: 'لا يمكن شراء اشتراك جديد', variant: 'destructive' });
      return;
    }
    const plan = SUBSCRIPTION_PLANS.find((p) => p.id === planId);
    if (!plan || !company?.name) {
      toast({ title: 'خطأ', description: 'بيانات الاشتراك غير مكتملة', variant: 'destructive' });
      return;
    }

    setPaymentLoadingPlan(planId);
    const result = await subscribeToPlan(planId, {
      amount: plan.price,
      companyId: company.id,
    });

    if (!result.success) {
      // Check if the subscription was recovered (STALE_RESOLVED_COMPLETED)
      // — refresh the page state to reflect the active subscription
      if (result.message.includes('تم إكمال عملية دفع سابقة')) {
        toast({ title: 'تم تفعيل الاشتراك', description: result.message, variant: 'default' });
        // Reload to refresh subscription status
        setTimeout(() => window.location.reload(), 2000);
      } else if (result.message.includes('فشلت عملية دفع سابقة')) {
        // Stale payment failed — user can retry
        toast({ title: 'يمكنك المحاولة مرة أخرى', description: result.message, variant: 'default' });
      } else {
        toast({ title: 'فشل الدفع', description: result.message, variant: 'destructive' });
      }
    }
    // If success, the browser is already redirecting to ZainCash — no cleanup needed
    setPaymentLoadingPlan(null);
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

              {companySubscriptionActive ? (
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-green-500 shrink-0" />
                  <p className="font-bold text-sm text-green-600">الاشتراك مفعّل</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <AppInput
                    value={activationCode}
                    onChange={(e) => {
                      setActivationCode(e.target.value);
                      setActivationError('');
                      setActivationSuccess('');
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

                  <AnimatePresence>
                    {activationSuccess && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-xs text-green-600 text-center font-medium"
                      >
                        {activationSuccess}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Subscription plan cards — hidden when subscription is active */}
            {companySubscriptionActive ? (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4
                              shadow-[0_2px_12px_rgba(0,0,0,0.06)]
                              border border-black/[0.04] dark:border-white/[0.06]">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-3 h-3 rounded-full bg-green-500 shrink-0" />
                  <p className="font-bold text-sm text-green-600">اشتراكك مفعل بالفعل</p>
                </div>
                {company?.subscriptionPlanId && (
                  <p className="text-xs text-muted-foreground mb-1">
                    الخطة: {company.subscriptionPlanId}
                  </p>
                )}
                {company?.subscriptionExpiresAt && (
                  <p className="text-xs text-muted-foreground">
                    تاريخ الانتهاء: {new Date(company.subscriptionExpiresAt).toLocaleDateString('ar')}
                  </p>
                )}
              </div>
            ) : (
              <>
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
                      loading={paymentLoadingPlan === plan.id}
                    />
                  </motion.div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </MobileLayout>
  );
}
