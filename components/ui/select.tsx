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
        "h-14 w-full min-w-0 appearance-none rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(9,9,9,0.98))] px-4 text-base text-[#f5f1e8] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition focus:border-[#7CFF00]/55 focus:shadow-[0_0_0_4px_rgba(124,255,0,0.10)] sm:text-sm",
        className
      )}
      {...props}
    />
  );
});
