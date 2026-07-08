import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function FilterChip({
  active = false,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-full border px-4 text-sm font-bold transition duration-200 active:scale-[0.98]",
        active
          ? "border-[var(--bvr-green-border)] bg-[var(--bvr-green)] text-[#0a0a0c]"
          : "border-white/10 bg-white/[0.035] text-white/78 hover:border-[var(--bvr-green-border)] hover:text-white",
        className
      )}
      {...props}
    />
  );
}
