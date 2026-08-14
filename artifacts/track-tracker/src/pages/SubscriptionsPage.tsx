import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { ArrowRight, Loader2, CreditCard, CheckCircle2, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MobileLayout } from '@/layouts/MobileLayout';
import { AppInput } from '@/components/AppInput';
import { AppButton } from '@/components/AppButton';
import { SubscriptionPlanCard } from '@/components/SubscriptionPlanCard';
import { SUBSCRIPTION_PLANS } from '@/services/subscriptionService';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/hooks/use-toast';
import { useZainCashPayment } from '@/hooks/useZainCashPayment';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * SubscriptionsPage — Company Owner only.
 *
 * Displays subscription plan cards connected to ZainCash payment flow,
 * plus an activation code input for manual activation.
 *
 * Bug 1 fix: Only the plan the user actually paid for shows "Active".
 *   We query payment_records for the latest completed payment's plan_id.
 *   If subscription was activated via discount code (no payment record),
 *   no plan shows "Active" — all remain clickable.
 *
 * Bug 2 fix: Only the clicked plan shows loading state.
 *   loadingPlanId tracks which plan is in-flight via ZainCash.
 */
export default function SubscriptionsPage() {
  const [, setLocation] = useLocation();
  const { activateSubscription, companySubscriptionActive, company } = useApp();
  const { toast } = useToast();
  const { loadingPlanId, initiatePayment, verifyPendingPayment } = useZainCashPayment();

  // ── Active plan ID (Bug 1 fix) ──
  // Determined by querying payment_records for the latest completed payment.
  // null = no specific plan paid (discount code activation, or not active).
  const [activePlanId, setActivePlanId] = useState<string | null>(null);

  useEffect(() => {
    if (!companySubscriptionActive || !isSupabaseConfigured) {
      setActivePlanId(null);
      return;
    }

    // Query payment_records for the latest completed payment to find which plan is active.
    // This is a read-only query — no payment flow modification.
    const fetchActivePlanId = async () => {
      try {
        const { data, error } = await supabase
          .from('payment_records')
          .select('plan_id')
          .eq('company_id', company.name)  // company.name used as companyId in current flow
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(1);

        if (!error && data && data.length > 0 && data[0].plan_id) {
          setActivePlanId(data[0].plan_id);
        } else {
          // Subscription is active but no completed payment record found.
          // This means it was activated via discount code — no plan should show as "Active".
          setActivePlanId(null);
        }
      } catch {
        // Non-critical — fall back to no active plan shown
        setActivePlanId(null);
      }
    };

    fetchActivePlanId();
  }, [companySubscriptionActive, company.name]);

  // ── Activation code state ──
  const [activationCode, setActivationCode] = useState('');
  const [activationLoading, setActivationLoading] = useState(false);
  const [activationError, setActivationError] = useState('');
  const [activationSuccess, setActivationSuccess] = useState('');

  // ── Verify pending ZainCash payment on mount ──
  // Uses a module-level guard to survive component remounts.
  // Previously, a useRef was used, but it resets on unmount. If
  // AuthContext's isLoading flips to true (e.g., on SIGNED_IN event),
  // ProtectedRoute unmounts SubscriptionsPage, the ref resets, and
  // the verification re-runs on remount — causing an infinite loop.
  // The module-level flag persists across remounts within the same
  // session, so the verification only runs once per page load.
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const verifyPendingPaymentRef = useRef(verifyPendingPayment);
  verifyPendingPaymentRef.current = verifyPendingPayment;

  useEffect(() => {
    // Skip if there's no pending payment in sessionStorage —
    // this is the primary guard: if a previous verification already
    // cleared sessionStorage, there's nothing to re-verify.
    const raw = sessionStorage.getItem('tt_zaincash_pending');
    if (!raw) return;

    try {
      const pending = JSON.parse(raw);
      if (!pending?.transactionId) return;
      // Only check if recently redirected (< 5 minutes ago)
      if (!(pending.timestamp && Date.now() - pending.timestamp < 5 * 60 * 1000)) return;
    } catch {
      return;
    }

    // Run verification (sessionStorage presence is the guard;
    // verifyPendingPayment clears it on completion/error).
    const check = async () => {
      try {
        setVerifyingPayment(true);
        await verifyPendingPaymentRef.current();
        setVerifyingPayment(false);
      } catch {
        setVerifyingPayment(false);
      }
    };
    check();
  }, []);

  const handleActivate = async () => {
    const code = activationCode.trim();
    if (!code) {
      setActivationError('الرجاء إدخال كود التفعيل');
      return;
    }

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

  const handleSubscribe = async (planId: string, amount: number) => {
    if (companySubscriptionActive) {
      toast({ title: 'الاشتراك مفعّل بالفعل' });
      return;
    }
    await initiatePayment(planId, amount);
  };

  // ── Payment verification overlay ──
  if (verifyingPayment) {
    return (
      <MobileLayout>
        <div className="flex flex-col items-center justify-center h-[100dvh] gap-4 px-6">
          <Loader2 size={40} className="animate-spin text-primary" />
          <p className="font-bold text-foreground text-lg">جارٍ التحقق من حالة الدفع…</p>
          <p className="text-sm text-muted-foreground text-center">
            يرجى الانتظار بينما نتأكد من حالة عملية الدفع
          </p>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="flex flex-col flex-1 h-[100dvh]">

        {/* ── Header ── */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-background shrink-0">
          <div className="w-10" />
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
                  <CheckCircle2 size={16} className="text-green-500 shrink-0" />
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

            {/* ── ZainCash payment info ── */}
            {!companySubscriptionActive && (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4
                              shadow-[0_2px_12px_rgba(0,0,0,0.06)]
                              border border-black/[0.04] dark:border-white/[0.06]">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard size={16} className="text-primary shrink-0" />
                  <p className="text-xs text-muted-foreground font-semibold">الدفع عبر ZainCash</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  اختر خطة الاشتراك واضغط "اشترك الآن" للدفع عبر ZainCash
                </p>
              </div>
            )}

            {/* Subscription plan cards — Bug 1 & 2 fixes */}
            {SUBSCRIPTION_PLANS.map((plan, index) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08, duration: 0.3 }}
              >
                <SubscriptionPlanCard
                  plan={plan}
                  onSubscribe={(planId) => handleSubscribe(planId, plan.price)}
                  isActive={activePlanId === plan.id}
                  loadingPlanId={loadingPlanId}
                />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </MobileLayout>
  );
}
