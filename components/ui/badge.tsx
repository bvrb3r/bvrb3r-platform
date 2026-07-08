import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-[#C4F24E]/25 bg-[#C4F24E]/12 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#C4F24E] shadow-[0_0_0_1px_rgba(196, 242, 78,0.04)]",
        className
      )}
      {...props}
    />
  );
}
