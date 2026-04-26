import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-[#A3FF12]/25 bg-[#A3FF12]/12 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#A3FF12] shadow-[0_0_0_1px_rgba(163,255,18,0.04)]",
        className
      )}
      {...props}
    />
  );
}
