import { cva } from "class-variance-authority";
import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-[48px] min-w-0 items-center justify-center gap-2 rounded-full border px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] whitespace-normal leading-tight transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CFF00] focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:pointer-events-none disabled:opacity-50 sm:px-5 sm:text-[11px] sm:tracking-[0.22em] sm:whitespace-nowrap",
  {
    variants: {
      variant: {
        primary:
          "border-[#cfff93]/40 bg-[linear-gradient(135deg,#7cff00_0%,#b7ff58_100%)] text-black shadow-[0_14px_34px_rgba(124,255,0,0.24)] hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(124,255,0,0.32)]",
        secondary:
          "border-white/10 bg-[linear-gradient(180deg,rgba(31,31,31,0.96),rgba(11,11,11,0.98))] text-white hover:border-[#7cff00]/30 hover:bg-[linear-gradient(180deg,rgba(34,34,34,0.96),rgba(14,14,14,0.98))] hover:text-[#d8ff9f]",
        ghost:
          "border-transparent bg-transparent text-white/70 hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
      }
    },
    defaultVariants: {
      variant: "primary"
    }
  }
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, ...props },
  ref
) {
  return <button ref={ref} className={cn(buttonVariants({ variant }), className)} {...props} />;
});
