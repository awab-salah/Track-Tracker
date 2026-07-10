import { Minus, Plus } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * Shared numeric quantity stepper (-/+) used by the Load form and the Sales
 * product selector. Keeps styling consistent with the app's rounded, muted
 * control language (see SegmentedControl / toggle track).
 */
export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max,
  testId = 'stepper',
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  testId?: string;
}) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(max !== undefined ? Math.min(max, value + 1) : value + 1);

  return (
    <div className="flex items-center gap-3 bg-muted rounded-2xl p-1" data-testid={testId}>
      <motion.button
        type="button"
        whileTap={{ scale: 0.88 }}
        onClick={dec}
        disabled={value <= min}
        className="w-9 h-9 rounded-xl bg-white dark:bg-zinc-800 shadow-sm flex items-center
                   justify-center text-foreground disabled:opacity-30 transition-opacity"
        data-testid={`${testId}-decrease`}
      >
        <Minus size={16} />
      </motion.button>
      <span className="w-8 text-center font-bold text-foreground tabular-nums" data-testid={`${testId}-value`}>
        {value}
      </span>
      <motion.button
        type="button"
        whileTap={{ scale: 0.88 }}
        onClick={inc}
        disabled={max !== undefined && value >= max}
        className="w-9 h-9 rounded-xl bg-white dark:bg-zinc-800 shadow-sm flex items-center
                   justify-center text-foreground disabled:opacity-30 transition-opacity"
        data-testid={`${testId}-increase`}
      >
        <Plus size={16} />
      </motion.button>
    </div>
  );
}
