/**
 * Subscription Service — future-ready hooks and helpers for subscription logic.
 *
 * Currently only defines types and stub functions.
 * Backend integration will be added later.
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
  benefit?: string; // e.g. "أول شهر مجاني"
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

// ── Stub functions (backend not implemented yet) ─────────────────────────────

/**
 * Validate and apply a promo code.
 * Placeholder — will call the backend when implemented.
 */
export async function applyPromoCode(_code: string): Promise<PromoCodeResult> {
  // TODO: implement backend call
  return { success: false, message: 'لم يتم تفعيل هذه الخدمة بعد' };
}

/**
 * Subscribe to a plan via ZainCash V2 Payment Gateway.
 *
 * Calls POST /api/zaincash/v2/create with {planId, amount, companyId},
 * receives a redirectUrl, and redirects the browser to ZainCash's hosted
 * payment page. After payment, ZainCash redirects back to our callback
 * endpoint which auto-redirects to /subscriptions.
 *
 * @param planId - The plan ID (e.g. "plan-10")
 * @param options - { amount: number, companyId: string } — company NAME (not UUID)
 * @returns { success: true, message } while redirecting, or { success: false, message } on error
 */
export async function subscribeToPlan(
  planId: string,
  options: { amount: number; companyId: string },
): Promise<{ success: boolean; message: string }> {
  const { amount, companyId } = options;

  if (!amount || amount <= 0) {
    return { success: false, message: 'المبلغ غير صالح' };
  }
  if (!companyId) {
    return { success: false, message: 'لم يتم العثور على بيانات الشركة' };
  }

  try {
    // Include the Supabase auth token so the backend can verify ownership
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    const response = await fetch('/api/zaincash/v2/create', {
      method: 'POST',
      headers,
      body: JSON.stringify({ planId, amount, companyId }),
    });

    if (!response.ok) {
      return { success: false, message: 'فشل إنشاء عملية الدفع' };
    }

    const data = await response.json();

    if (data.redirectUrl && typeof data.redirectUrl === 'string') {
      // Redirect to ZainCash hosted payment page
      window.location.href = data.redirectUrl;
      return { success: true, message: 'جارٍ تحويلك إلى صفحة الدفع...' };
    }

    return { success: false, message: 'استجابة غير متوقعة من الخادم' };
  } catch {
    return { success: false, message: 'حدث خطأ في الاتصال بخادم الدفع' };
  }
}
