import { ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

interface AppButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}

export function AppButton({ children, variant = "primary", className, ...props }: AppButtonProps) {
  const variants = {
    primary: "bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/95",
    secondary: "bg-secondary text-secondary-foreground shadow-md shadow-secondary/20 hover:bg-secondary/95",
    ghost: "bg-transparent text-primary hover:bg-primary/5",
  };

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      className={cn(
        "w-full min-h-[56px] rounded-2xl font-bold text-lg transition-colors flex items-center justify-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </motion.button>
  );
}
