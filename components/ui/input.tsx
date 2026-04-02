import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-14 w-full min-w-0 rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(9,9,9,0.98))] px-4 text-base text-[#f5f1e8] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition placeholder:text-white/32 focus:border-[#7CFF00]/55 focus:shadow-[0_0_0_4px_rgba(124,255,0,0.10)] sm:text-sm",
        className
      )}
      {...props}
    />
  );
});
