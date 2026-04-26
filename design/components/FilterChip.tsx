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
          ? "border-[#a3ff12]/50 bg-[#a3ff12] text-[#050505]"
          : "border-white/10 bg-white/[0.035] text-white/78 hover:border-[#a3ff12]/28 hover:text-white",
        className
      )}
      {...props}
    />
  );
}
