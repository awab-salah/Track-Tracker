import { motion } from 'framer-motion';
import { AppButton } from '@/components/AppButton';
import { Badge } from '@/components/ui/badge';
import type { SubscriptionPlan } from '@/services/subscriptionService';

/**
 * SubscriptionPlanCard — displays a single subscription plan.
 *
 * Uses the app's existing design system (colors, shadows, border-radius, typography).
 * When `plan.isPopular` is true, a "Most Popular" badge and subtle border
 * treatment are added while still matching the overall design language.
 */

interface SubscriptionPlanCardProps {
  plan: SubscriptionPlan;
  onSubscribe: (planId: string) => void;
}

export function SubscriptionPlanCard({ plan, onSubscribe }: SubscriptionPlanCardProps) {
  const formatPrice = (price: number) =>
    price.toLocaleString('ar-IQ');

  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      className={`relative rounded-2xl p-5
                  shadow-[0_2px_12px_rgba(0,0,0,0.06)]
                  border transition-shadow duration-300
                  bg-white dark:bg-zinc-900
                  ${plan.isPopular
                    ? 'border-primary/30 shadow-[0_4px_20px_rgba(13,59,74,0.12)]'
                    : 'border-black/[0.04] dark:border-white/[0.06]'
                  }`}
    >
      {/* Popular badge */}
      {plan.isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge
            variant="default"
            className="text-[10px] px-3 py-0.5 rounded-full"
          >
            الأكثر شيوعاً
          </Badge>
        </div>
      )}

      {/* Plan title */}
      <h3 className="font-extrabold text-xl text-foreground">
        {plan.title}
      </h3>

      {/* Subtitle */}
      <p className="text-sm text-muted-foreground mt-1">
        {plan.subtitle}
      </p>

      {/* Price */}
      <div className="mt-4">
        <span className="text-2xl font-extrabold" style={{ color: '#0D3B4A' }}>
          {formatPrice(plan.price)}
        </span>
        <span className="text-sm text-muted-foreground mr-1">
          {plan.currency} / {plan.billingPeriod}
        </span>
      </div>

      {/* Subscribe button */}
      <div className="mt-4">
        <AppButton onClick={() => onSubscribe(plan.id)}>
          اشترك الآن
        </AppButton>
      </div>
    </motion.div>
  );
}
