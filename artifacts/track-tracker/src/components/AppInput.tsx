import React, { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface AppInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export const AppInput = forwardRef<HTMLInputElement, AppInputProps>(
  ({ label, hint, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-2 w-full">
        {label && (
          <label className="text-sm font-semibold text-foreground ml-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={cn(
            // Base layout & shape
            "w-full min-h-[56px] rounded-2xl px-4 py-2 text-base outline-none transition-all duration-200 shadow-sm",
            // Light mode
            "bg-white border border-input text-foreground placeholder:text-muted-foreground",
            // Focus – light mode
            "focus:border-primary focus:ring-1 focus:ring-primary",
            // Dark mode – background & text must be explicit (browser ignores generic dark vars for inputs)
            "dark:bg-zinc-800 dark:border-zinc-700 dark:text-white dark:placeholder:text-zinc-500",
            // Dark mode – cursor colour & autofill colour scheme
            "dark:[color-scheme:dark]",
            // Dark mode – focus ring keeps brand colour
            "dark:focus:border-primary dark:focus:ring-primary",
            className
          )}
          {...props}
        />
        {hint && (
          <p className="text-xs text-muted-foreground mt-1 mr-2">{hint}</p>
        )}
      </div>
    );
  }
);
AppInput.displayName = "AppInput";
