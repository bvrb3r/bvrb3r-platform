import type { ButtonHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export type ActionButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ActionButtonVariant;
}

export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton(
  { className, variant = "primary", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex min-h-12 min-w-0 items-center justify-center gap-2 px-5 text-sm font-extrabold transition duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "bvr-primary-action",
        variant === "secondary" && "bvr-secondary-action",
        variant === "ghost" && "rounded-full border border-transparent bg-transparent text-white/68 hover:border-white/10 hover:bg-white/[0.04] hover:text-white",
        variant === "danger" && "rounded-full border border-red-400/25 bg-red-500/8 text-[#ff4d4d] hover:bg-red-500/12",
        className
      )}
      {...props}
    />
  );
});
