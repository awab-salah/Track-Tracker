import { useState } from 'react';
import { motion } from 'framer-motion';
import { AppInput } from '@/components/AppInput';
import { AppButton } from '@/components/AppButton';
import { applyPromoCode } from '@/services/subscriptionService';

/**
 * PromoCodeSection — reusable promo code input + apply button.
 *
 * UI-only for now; backend integration is stubbed in subscriptionService.
 * The `onApplied` callback fires when a code is successfully applied
 * (currently never, until backend is wired up).
 */
interface PromoCodeSectionProps {
  onApplied?: (benefit: string) => void;
}

export function PromoCodeSection({ onApplied }: PromoCodeSectionProps) {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleApply = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError('الرجاء إدخال الكود');
      setSuccess('');
      return;
    }
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const result = await applyPromoCode(trimmed);
      if (result.success) {
        setSuccess(result.message);
        if (result.benefit) {
          onApplied?.(result.benefit);
        }
        setCode('');
      } else {
        setError(result.message);
      }
    } catch {
      setError('حدث خطأ، حاول مرة أخرى');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4
                    shadow-[0_2px_12px_rgba(0,0,0,0.06)]
                    border border-black/[0.04] dark:border-white/[0.06]">
      <p className="text-xs text-muted-foreground font-semibold mb-3">كود الخصم</p>

      <div className="flex flex-col gap-3">
        <AppInput
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError('');
            setSuccess('');
          }}
          placeholder="أدخل الكود"
          dir="ltr"
        />

        <AppButton
          onClick={handleApply}
          disabled={isLoading}
          variant="secondary"
        >
          {isLoading ? 'جارٍ التحقق...' : 'استخدام الكود'}
        </AppButton>

        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-red-500 text-center font-medium"
          >
            {error}
          </motion.p>
        )}

        {success && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-green-600 text-center font-medium"
          >
            {success}
          </motion.p>
        )}
      </div>
    </div>
  );
}
