import { SelectHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...props },
  ref
) {
  return (
    <select
      ref={ref}
      className={cn(
        "h-12 w-full min-w-0 appearance-none rounded-[14px] border border-white/10 bg-[#101010] px-4 text-base text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition focus:border-[#A3FF12]/55 focus:shadow-[0_0_0_4px_rgba(163,255,18,0.10)] sm:text-sm",
        className
      )}
      {...props}
    />
  );
});
