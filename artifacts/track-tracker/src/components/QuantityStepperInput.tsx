import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * Quantity control that combines a directly-typeable numeric input with the
 * app's existing -/+ stepper buttons (placed on the left side of the input).
 * Used by the Load tab. Visually reuses the same button styling as
 * QuantityStepper so it doesn't introduce a new control language.
 */
export function QuantityStepperInput({
  value,
  onChange,
  min = 0,
  max,
  testId = 'stepper-input',
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  testId?: string;
}) {
  const clamp = (n: number) => {
    let v = Number.isFinite(n) ? n : min;
    v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };

  // Local text mirrors the input so the user can freely type/clear digits
  // without the controlled numeric value fighting the cursor.
  const [text, setText] = useState(String(value));

  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const dec = () => onChange(clamp(value - 1));
  const inc = () => onChange(clamp(max !== undefined ? Math.min(max, value + 1) : value + 1));

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setText(raw);
    if (raw === '') return;
    const parsed = Number(raw);
    if (!Number.isNaN(parsed)) onChange(parsed);
  };

  const handleBlur = () => {
    const parsed = clamp(Number(text));
    onChange(parsed);
    setText(String(parsed));
  };

  return (
    <div className="flex items-center gap-2" data-testid={testId}>
      <input
        type="number"
        inputMode="numeric"
        value={text}
        onChange={handleInputChange}
        onBlur={handleBlur}
        min={min}
        max={max}
        className="w-full min-h-[44px] rounded-2xl px-4 text-base text-center font-bold tabular-nums outline-none
                   transition-all duration-200 shadow-sm bg-white border border-input text-foreground
                   focus:border-primary focus:ring-1 focus:ring-primary
                   dark:bg-zinc-800 dark:border-zinc-700 dark:text-white dark:[color-scheme:dark]
                   dark:focus:border-primary dark:focus:ring-primary"
        data-testid={`${testId}-field`}
      />
      <div className="flex items-center gap-1 bg-muted rounded-2xl p-1 shrink-0">
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
    </div>
  );
}
