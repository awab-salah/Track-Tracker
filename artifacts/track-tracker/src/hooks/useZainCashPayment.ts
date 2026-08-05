/**
 * useZainCashPayment —4 Hook for ZainCash payment flow from the client side.
 *
 * Flow:
 *   1. Call /api/zaincash/create with plan details
 *   2. Redirect user to ZainCash payment page
 *   3. After redirect back, call /api/zaincash/verify to confirm
 *   4. On confirmed payment, activate subscription locally
 */
import { useState, useCallback } from 'react';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/hooks/use-toast';

interface PaymentState {
  loading: boolean;
  error: string | null;
  transactionId: string | null;
  redirectUrl: string | null;
}

export function useZainCashPayment() {
  const { activateSubscription, company } = useApp();
  const { toast } = useToast();

  const [state, setState] = useState<PaymentState>({
    loading: false,
    error: null,
    transactionId: null,
    redirectUrl: null,
  });

  /**
   * Initiate a ZainCash payment for a subscription plan.
   * On success, redirects the browser to ZainCash payment page.
   */
  const initiatePayment = useCallback(async (planId: string, amount: number) => {
    setState({ loading: true, error: null, transactionId: null, redirectUrl: null });

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
        loading: false,
        error: null,
        transactionId: data.transactionId,
        redirectUrl: data.redirectUrl,
      });

      // Redirect user to ZainCash payment page
      window.location.href = data.redirectUrl;

    } catch (err) {
      const message = err instanceof Error ? err.message : 'حدث خطأ غير متوقع';
      setState({ loading: false, error: message, transactionId: null, redirectUrl: null });
      toast({ title: message, variant: 'destructive' });
    }
  }, [company.name, toast]);

  /**
   * Verify a pending payment after redirect back from ZainCash.
   * Call this on the subscriptions page mount if there's a pending transaction.
   */
  const verifyPendingPayment = useCallback(async (): Promise<boolean> => {
    let pending: { transactionId: string; orderId: string; planId: string } | null = null;

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
    } catch {
      return false;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch(`/api/zaincash/verify?transactionId=${pending!.transactionId}`);

      if (!response.ok) {
        throw new Error('فشل التحقق من حالة الدفع');
      }

      const data = await response.json() as { status: string };

      if (data.status === 'completed') {
        // Payment verified! Activate subscription.
        // Use a special activation code for ZainCash payments
        const success = await activateSubscription('track1');

        // Clean up pending payment
        try { sessionStorage.removeItem('tt_zaincash_pending'); } catch { /* ok */ }

        if (success) {
          toast({ title: 'تم الدفع بنجاح وتفعيل الاشتراك!' });
          setState({ loading: false, error: null, transactionId: pending!.transactionId, redirectUrl: null });
          return true;
        } else {
          toast({ title: 'تم الدفع بنجاح، لكن فشل التفعيل. تواصل مع الدعم.', variant: 'destructive' });
          setState({ loading: false, error: 'Activation failed', transactionId: null, redirectUrl: null });
          return false;
        }
      } else if (data.status === 'failed') {
        try { sessionStorage.removeItem('tt_zaincash_pending'); } catch { /* ok */ }
        toast({ title: 'فشلت عملية الدفع', variant: 'destructive' });
        setState({ loading: false, error: 'Payment failed', transactionId: null, redirectUrl: null });
        return false;
      } else {
        // Still pending/processing — user can check again
        setState({ loading: false, error: null, transactionId: pending!.transactionId, redirectUrl: null });
        return false;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'حدث خطأ أثناء التحقق';
      setState(prev => ({ ...prev, loading: false, error: message }));
      return false;
    }
  }, [activateSubscription, toast]);

  return {
    ...state,
    initiatePayment,
    verifyPendingPayment,
  };
}
