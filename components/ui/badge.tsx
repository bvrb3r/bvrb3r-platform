import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-[#7cff00]/25 bg-[linear-gradient(180deg,rgba(124,255,0,0.16),rgba(124,255,0,0.07))] px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.32em] text-[#d3ffa0] shadow-[0_0_0_1px_rgba(124,255,0,0.04)]",
        className
      )}
      {...props}
    />
  );
}