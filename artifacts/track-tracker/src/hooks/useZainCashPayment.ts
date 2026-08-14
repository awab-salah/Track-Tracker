/**
 * useZainCashPayment —4 Hook for ZainCash payment flow from the client side.
 *
 * Flow:
 *   1. Call /api/zaincash/create with plan details
 *   2. Redirect user to ZainCash payment page
 *   3. After redirect back, call /api/zaincash/verify to confirm
 *   4. On confirmed payment, activate subscription locally
 *
 * Bug fix: Verification loop protection.
 *   - verifyPendingPayment() now clears sessionStorage on ANY terminal state
 *     (completed, failed, or max retries exceeded).
 *   - A retry counter is stored in sessionStorage to prevent infinite polling.
 *   - The SubscriptionsPage useEffect must use a STABLE dependency (not the
 *     function reference) to avoid re-triggering on every render.
 */
import { useState, useCallback, useRef } from 'react';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/hooks/use-toast';

interface PaymentState {
  /** Which plan is currently loading (null = none). Replaces global boolean. */
  loadingPlanId: string | null;
  error: string | null;
  transactionId: string | null;
  redirectUrl: string | null;
}

export function useZainCashPayment() {
  const { activateSubscription, company } = useApp();
  const { toast } = useToast();

  const [state, setState] = useState<PaymentState>({
    loadingPlanId: null,
    error: null,
    transactionId: null,
    redirectUrl: null,
  });

  /**
   * Initiate a ZainCash payment for a subscription plan.
   * On success, redirects the browser to ZainCash payment page.
   */
  const initiatePayment = useCallback(async (planId: string, amount: number) => {
    setState({ loadingPlanId: planId, error: null, transactionId: null, redirectUrl: null });

    try {
      const response = await fetch('/api/zaincash/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          amount,
          companyId: company.name, // We use company name as identifier; in production use companyId
        }),
      });

      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'فشل إنشاء عملية الدفع');
      }

      const data = await response.json() as {
        transactionId: string;
        redirectUrl: string;
        orderId: string;
      };

      // Store payment info in sessionStorage so we can verify after redirect
      try {
        sessionStorage.setItem('tt_zaincash_pending', JSON.stringify({
          transactionId: data.transactionId,
          orderId: data.orderId,
          planId,
          timestamp: Date.now(),
        }));
      } catch { /* best effort */ }

      setState({
        loadingPlanId: null,
        error: null,
        transactionId: data.transactionId,
        redirectUrl: data.redirectUrl,
      });

      // Redirect user to ZainCash payment page
      window.location.href = data.redirectUrl;

    } catch (err) {
      const message = err instanceof Error ? err.message : 'حدث خطأ غير متوقع';
      setState({ loadingPlanId: null, error: message, transactionId: null, redirectUrl: null });
      toast({ title: message, variant: 'destructive' });
    }
  }, [company.name, toast]);

  // ── Retry counter for verification loop protection ──
  // Stored in sessionStorage alongside the pending payment data.
  // Prevents infinite polling when the payment is stuck in pending
  // or the ZainCash API returns errors.
  const MAX_VERIFY_RETRIES = 6; // 6 attempts × ~5s delay = 30s max wait
  const verifyAttemptRef = useRef(0);

  /**
   * Verify a pending payment after redirect back from ZainCash.
   * Call this on the subscriptions page mount if there's a pending transaction.
   *
   * IMPORTANT: This function clears sessionStorage on ANY terminal state:
   *   - Payment completed → clear + activate subscription
   *   - Payment failed → clear + show error
   *   - Max retries exceeded → clear + show timeout message
   *   - Verification API error after retries → clear + show error
   * This prevents the infinite useEffect loop that caused the flashing.
   */
  const verifyPendingPayment = useCallback(async (): Promise<boolean> => {
    let pending: { transactionId: string; orderId: string; planId: string; verifyAttempts?: number } | null = null;

    try {
      const raw = sessionStorage.getItem('tt_zaincash_pending');
      if (!raw) return false;
      pending = JSON.parse(raw);
      if (!pending?.transactionId) return false;

      // Check if pending is too old (> 30 minutes)
      const stored = JSON.parse(raw) as { timestamp?: number };
      if (stored.timestamp && Date.now() - stored.timestamp > 30 * 60 * 1000) {
        sessionStorage.removeItem('tt_zaincash_pending');
        return false;
      }

      // Check retry count to prevent infinite polling
      const attempts = (pending.verifyAttempts ?? 0) + 1;
      if (attempts > MAX_VERIFY_RETRIES) {
        // Max retries exceeded — stop polling, clear sessionStorage
        console.warn('[ZainCash] Max verification retries exceeded, stopping poll');
        try { sessionStorage.removeItem('tt_zaincash_pending'); } catch { /* ok */ }
        toast({ title: 'انتهت مهلة التحقق من الدفع. تحقق من حالة الاشتراك لاحقاً.', variant: 'destructive' });
        setState({ loadingPlanId: null, error: 'Verification timed out', transactionId: pending.transactionId, redirectUrl: null });
        return false;
      }

      // Update retry counter in sessionStorage
      try {
        sessionStorage.setItem('tt_zaincash_pending', JSON.stringify({ ...pending, verifyAttempts: attempts }));
      } catch { /* best effort */ }
    } catch {
      return false;
    }

    setState(prev => ({ ...prev, loadingPlanId: 'verifying', error: null }));

    try {
      const response = await fetch(`/api/zaincash/verify?transactionId=${pending!.transactionId}`);

      if (!response.ok) {
        // API error — could be temporary (502 from ZainCash). Don't clear sessionStorage yet,
        // let the retry counter handle it. But if we've exhausted retries, clear it.
        if (verifyAttemptRef.current + 1 >= MAX_VERIFY_RETRIES) {
          try { sessionStorage.removeItem('tt_zaincash_pending'); } catch { /* ok */ }
          toast({ title: 'فشل التحقق من حالة الدفع. حاول مرة أخرى لاحقاً.', variant: 'destructive' });
          setState({ loadingPlanId: null, error: 'Verification failed after retries', transactionId: null, redirectUrl: null });
          return false;
        }
        throw new Error('فشل التحقق من حالة الدفع');
      }

      const data = await response.json() as { status: string };

      if (data.status === 'completed') {
        // Payment verified! Activate subscription.
        // Use a special activation code for ZainCash payments
        const success = await activateSubscription('track1');

        // Clean up pending payment — ALWAYS clear on terminal state
        try { sessionStorage.removeItem('tt_zaincash_pending'); } catch { /* ok */ }

        if (success) {
          toast({ title: 'تم الدفع بنجاح وتفعيل الاشتراك!' });
          setState({ loadingPlanId: null, error: null, transactionId: pending!.transactionId, redirectUrl: null });
          return true;
        } else {
          toast({ title: 'تم الدفع بنجاح، لكن فشل التفعيل. تواصل مع الدعم.', variant: 'destructive' });
          setState({ loadingPlanId: null, error: 'Activation failed', transactionId: null, redirectUrl: null });
          return false;
        }
      } else if (data.status === 'failed') {
        // Payment failed — clear sessionStorage (terminal state)
        try { sessionStorage.removeItem('tt_zaincash_pending'); } catch { /* ok */ }
        toast({ title: 'فشلت عملية الدفع', variant: 'destructive' });
        setState({ loadingPlanId: null, error: 'Payment failed', transactionId: null, redirectUrl: null });
        return false;
      } else {
        // Still pending/processing — do NOT clear sessionStorage, let retry handle it
        // But update the attempt counter so we eventually stop
        verifyAttemptRef.current = (pending?.verifyAttempts ?? 0) + 1;
        if (verifyAttemptRef.current >= MAX_VERIFY_RETRIES) {
          // Give up after max retries
          try { sessionStorage.removeItem('tt_zaincash_pending'); } catch { /* ok */ }
          toast({ title: 'لم يتم التحقق من الدفع بعد. تحقق من حالة الاشتراك لاحقاً.', variant: 'destructive' });
          setState({ loadingPlanId: null, error: 'Still pending after retries', transactionId: pending?.transactionId ?? null, redirectUrl: null });
          return false;
        }
        setState({ loadingPlanId: null, error: null, transactionId: pending?.transactionId ?? null, redirectUrl: null });
        return false;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'حدث خطأ أثناء التحقق';
      // Increment attempt counter
      verifyAttemptRef.current += 1;
      if (verifyAttemptRef.current >= MAX_VERIFY_RETRIES) {
        try { sessionStorage.removeItem('tt_zaincash_pending'); } catch { /* ok */ }
        setState({ loadingPlanId: null, error: message, transactionId: null, redirectUrl: null });
        return false;
      }
      setState(prev => ({ ...prev, loadingPlanId: null, error: message }));
      return false;
    }
  }, [activateSubscription, toast]);

  return {
    ...state,
    initiatePayment,
    verifyPendingPayment,
  };
}
