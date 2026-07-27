/**
 * SubscriptionGate — blocking overlay for inactive company subscriptions.
 *
 * When a company account is NOT activated, the owner sees this overlay
 * instead of the restricted content. It includes a "Go to Profile" button
 * that navigates to the profile page where the activation code can be entered.
 *
 * For drivers: a different message is shown ("Your company subscription is
 * inactive. Please ask the company owner to activate the account.")
 * Drivers can still log in and view their profile, but business operations
 * (loads, sales, statistics) are blocked. A "Go to Profile" link lets them
 * navigate to their driver profile page.
 */
import { useLocation } from 'wouter';
import { Lock, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { AppButton } from '@/components/AppButton';

interface SubscriptionGateProps {
  /** 'company' = company owner gate, 'driver' = driver gate */
  variant: 'company' | 'driver';
}

export function SubscriptionGate({ variant }: SubscriptionGateProps) {
  const [, setLocation] = useLocation();

  if (variant === 'driver') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex-1 flex flex-col items-center justify-center gap-5 p-6 text-center"
      >
        <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
          <Lock size={28} className="text-red-500" />
        </div>
        <div>
          <p className="font-bold text-base text-foreground">
            اشتراك الشركة غير مفعّل
          </p>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            يرجى طلب من مالك الشركة تفعيل الحساب لتتمكن من استخدام التطبيق.
          </p>
        </div>
        <AppButton
          onClick={() => setLocation('/driver-profile')}
          className="mt-2"
        >
          <ArrowRight size={18} />
          الذهاب إلى الملف الشخصي
        </AppButton>
      </motion.div>
    );
  }

  // Company variant — has "Go to Profile" button
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 flex flex-col items-center justify-center gap-5 p-6 text-center"
    >
      <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
        <Lock size={28} className="text-red-500" />
      </div>
      <div>
        <p className="font-bold text-base text-foreground">
          انتهى اشتراكك أو غير مفعّل
        </p>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          يرجى الاشتراك أو تجديد الاشتراك لتتمكن من استخدام التطبيق.
        </p>
      </div>
      <AppButton
        onClick={() => setLocation('/profile')}
        className="mt-2"
      >
        <ArrowRight size={18} />
        الذهاب إلى الملف الشخصي
      </AppButton>
    </motion.div>
  );
}
