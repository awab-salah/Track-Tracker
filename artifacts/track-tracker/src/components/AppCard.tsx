import { ReactNode } from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

interface AppCardProps extends HTMLMotionProps<"div"> {
  children: ReactNode;
  interactive?: boolean;
}

export function AppCard({ children, interactive = false, className, ...props }: AppCardProps) {
  return (
    <motion.div
      whileTap={interactive ? { scale: 0.98 } : undefined}
      className={cn(
        "bg-card rounded-[20px] p-6 w-full shadow-[0_4px_24px_rgba(0,0,0,0.06)] border border-card-border",
        interactive && "cursor-pointer hover:shadow-[0_8px_32px_rgba(0,0,0,0.08)] transition-shadow duration-300",
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
