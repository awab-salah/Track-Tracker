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
      const errorData = await response.json().catch(() => ({ error: 'فشل إنشاء عملية الدفع' }));
      // Map backend error codes to user-facing Arabic messages
      const errorMessages: Record<string, string> = {
        'SUBSCRIPTION_ALREADY_ACTIVE': 'اشتراكك مفعل بالفعل',
        'PAYMENT_ALREADY_PENDING': 'يوجد عملية دفع قيد المعالجة بالفعل',
        'STALE_RESOLVED_COMPLETED': 'تم إكمال عملية دفع سابقة — يرجى تحديث الصفحة',
        'STALE_RESOLVED_FAILED': 'فشلت عملية دفع سابقة — يمكنك المحاولة مرة أخرى',
        'RESERVATION_NO_TRANSACTION_ID': 'يوجد حجز دفع معلق — يرجى التواصل مع الدعم',
        'NO_AUTH_TOKEN': 'يجب تسجيل الدخول أولاً',
        'AUTH_INVALID': 'انتهت الجلسة — يرجى تسجيل الدخول مرة أخرى',
        'COMPANY_MISMATCH': 'لا تملك صلاحية الدفع لهذه الشركة',
        'VERIFICATION_FAILED': 'تعذر التحقق من الحالة — يرجى المحاولة لاحقاً',
      };
      const code = errorData.code ?? '';
      const message = errorMessages[code] ?? errorData.error ?? 'فشل إنشاء عملية الدفع';
      return { success: false, message };
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
