import React, { forwardRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";

interface AppInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export const AppInput = forwardRef<HTMLInputElement, AppInputProps>(
  ({ label, hint, className, type, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPasswordField = type === "password";
    const effectiveType = isPasswordField
      ? (showPassword ? "text" : "password")
      : type;

    return (
      <div className="flex flex-col gap-2 w-full">
        {label && (
          <label className="text-sm font-semibold text-foreground ml-1">
            {label}
          </label>
        )}
        <div className="relative w-full">
          <input
            ref={ref}
            type={effectiveType}
            className={cn(
              // Base layout & shape
              "w-full min-h-[56px] rounded-2xl py-2 text-base outline-none transition-all duration-200 shadow-sm",
              // Padding — password fields need room for the eye icon on the end side
              isPasswordField ? "ps-4 pe-12" : "px-4",
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
          {isPasswordField && (
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute end-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
              aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          )}
        </div>
        {hint && (
          <p className="text-xs text-muted-foreground mt-1 mr-2">{hint}</p>
        )}
      </div>
    );
  }
);
AppInput.displayName = "AppInput";
