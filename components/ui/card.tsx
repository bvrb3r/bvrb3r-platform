import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative isolate w-full min-w-0 overflow-hidden rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl transition-transform duration-200 before:pointer-events-none before:absolute before:inset-[1px] before:rounded-[22px] before:border before:border-white/[0.04] before:content-[''] after:pointer-events-none after:absolute after:left-6 after:right-6 after:top-0 after:h-px after:bg-[linear-gradient(90deg,transparent,rgba(196, 242, 78,0.65),transparent)] after:content-['']",
        className
      )}
      {...props}
    />
  );
}
