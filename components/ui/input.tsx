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
        "h-12 w-full min-w-0 rounded-[14px] border border-white/10 bg-[#101010] px-4 text-base text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition placeholder:text-white/38 focus:border-[#C4F24E]/55 focus:shadow-[0_0_0_4px_rgba(196, 242, 78,0.10)] sm:text-sm",
        className
      )}
      {...props}
    />
  );
});
