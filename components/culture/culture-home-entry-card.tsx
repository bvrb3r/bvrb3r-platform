import type { Route } from "next";
import Link from "next/link";
import { Images } from "lucide-react";
import { GlassCard } from "@/design/components";

type CultureHomeEntryCardProps = {
  href: Route;
  subtitle: string;
  testId: string;
};

export const cultureHomeCtaClassName =
  "inline-flex min-h-12 items-center justify-center rounded-full border border-[#e4f9b8]/35 bg-[#C4F24E] px-5 text-sm font-black text-[#050505] shadow-none ring-1 ring-black/10 transition group-hover:bg-[#b3e63a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e4f9b8]/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black";

export function CultureHomeEntryCard({ href, subtitle, testId }: CultureHomeEntryCardProps) {
  return (
    <GlassCard
      className="mb-4 border-[#C4F24E]/16 bg-[linear-gradient(135deg,rgba(196, 242, 78,0.08),rgba(8,8,8,0.95)_50%,rgba(0,0,0,0.98))] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.35)] sm:p-6"
      data-testid={testId}
    >
      <Link href={href} className="group block">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#C4F24E]/24 bg-[#C4F24E]/10 text-[#C4F24E]">
              <Images className="h-5 w-5" />
            </div>
            <p className="mt-4 text-xs font-black uppercase tracking-[0.22em] text-[#C4F24E]">Culture</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.04em] text-white">Culture Feed</h2>
            <p className="mt-3 text-sm leading-6 text-white/62">
              {subtitle}
            </p>
          </div>
          <span className={cultureHomeCtaClassName} data-testid={`${testId}-cta`}>
            Open Culture
          </span>
        </div>
      </Link>
    </GlassCard>
  );
}
