import { useLocation } from 'wouter';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { MobileLayout } from '@/layouts/MobileLayout';
import { PromoCodeSection } from '@/components/PromoCodeSection';
import { SubscriptionPlanCard } from '@/components/SubscriptionPlanCard';
import { SUBSCRIPTION_PLANS, subscribeToPlan } from '@/services/subscriptionService';

/**
 * SubscriptionsPage — Company Owner only.
 *
 * Displays a promo code section followed by subscription plan cards.
 * All backend logic is stubbed; UI and validation-ready structure only.
 */
export default function SubscriptionsPage() {
  const [, setLocation] = useLocation();

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
