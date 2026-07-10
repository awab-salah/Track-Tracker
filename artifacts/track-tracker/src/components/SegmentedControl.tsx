import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Option {
  label: string;
  value: string;
}

interface SegmentedControlProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}

export function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
  return (
    <div className="relative flex w-full bg-muted p-1 rounded-[18px] min-h-[56px] items-center">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "relative flex-1 py-3 text-sm font-bold rounded-2xl z-10 transition-colors duration-200 outline-none",
            value === option.value ? "text-primary" : "text-muted-foreground hover:text-foreground"
          )}
          data-testid={`tab-${option.value}`}
        >
          {value === option.value && (
            <motion.div
              layoutId="capsule"
              className="absolute inset-0 bg-white rounded-2xl shadow-sm border border-black/[0.04]"
              transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
              style={{ zIndex: -1 }}
            />
          )}
          <span className="relative z-10">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
