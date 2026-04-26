import { cva } from "class-variance-authority";
import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-[48px] min-w-0 items-center justify-center gap-2 rounded-full border px-4 py-2 text-center text-[10px] font-extrabold uppercase tracking-[0.18em] whitespace-normal leading-tight transition duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A3FF12] focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:pointer-events-none disabled:opacity-50 sm:px-5 sm:text-[11px] sm:whitespace-nowrap",
  {
    variants: {
      variant: {
        primary:
          "border-[#A3FF12]/45 bg-[linear-gradient(135deg,#A3FF12_0%,#7DCE00_100%)] text-[#050505] shadow-[0_12px_35px_rgba(163,255,18,0.28)] hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(163,255,18,0.32)]",
        secondary:
          "border-white/10 bg-[rgba(255,255,255,0.035)] text-white hover:border-[#A3FF12]/30 hover:bg-white/[0.055] hover:text-[#A3FF12]",
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
