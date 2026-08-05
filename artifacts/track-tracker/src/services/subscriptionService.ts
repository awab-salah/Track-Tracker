/**
 * Subscription Service — Subscription plan definitions + ZainCash integration helpers.
 *
 * Plan prices are in IQD. ZainCash expects amounts in IQD (integer).
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface SubscriptionPlan {
  id: string;
  title: string;
  subtitle: string;
  price: number;
  currency: string;
  billingPeriod: string;
  driverCount: number | null; // null = unlimited
  isPopular: boolean;
}

export interface PromoCodeResult {
  success: boolean;
  message: string;
  benefit?: string;
}

// ── Plan definitions ─────────────────────────────────────────────────────────

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'plan-10',
    title: '10 سائق',
    subtitle: 'للشركات الصغيرة',
    price: 14000,
    currency: 'د.ع',
    billingPeriod: 'شهرياً',
    driverCount: 10,
    isPopular: false,
  },
  {
    id: 'plan-25',
    title: '25 سائق',
    subtitle: 'الأكثر شيوعاً',
    price: 29000,
    currency: 'د.ع',
    billingPeriod: 'شهرياً',
    driverCount: 25,
    isPopular: true,
  },
  {
    id: 'plan-50',
    title: '50 سائق',
    subtitle: 'للشركات المتوسطة والكبيرة',
    price: 55000,
    currency: 'د.ع',
    billingPeriod: 'شهرياً',
    driverCount: 50,
    isPopular: false,
  },
  {
    id: 'plan-unlimited',
    title: 'غير محدود',
    subtitle: 'للشركات الكبيرة جداً',
    price: 89000,
    currency: 'د.ع',
    billingPeriod: 'شهرياً',
    driverCount: null,
    isPopular: false,
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get a plan by its ID.
 */
export function getPlanById(planId: string): SubscriptionPlan | undefined {
  return SUBSCRIPTION_PLANS.find((p) => p.id === planId);
}

/**
 * Validate and apply a promo code.
 * Placeholder — will call the backend when implemented.
 */
export async function applyPromoCode(_code: string): Promise<PromoCodeResult> {
  return { success: false, message: 'لم يتم تفعيل هذه الخدمة بعد' };
}
