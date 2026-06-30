"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ARCHITECT_PRIMARY_NAV_ITEMS } from "@/components/architect-experience/architect-tab-config";
import { cn } from "@/lib/utils";

function isArchitectNavActive(pathname: string | null, href: string, itemId: string) {
  if (!pathname) {
    return false;
  }

  if (itemId === "ceo") {
    return pathname === "/architect/ceo";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ArchitectPrimaryNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="BVRB3R Mission Control Navigation" className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar xl:flex-wrap xl:justify-end xl:pb-0">
      {ARCHITECT_PRIMARY_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = isArchitectNavActive(pathname, item.href, item.id);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-[8px] border px-3 text-[10px] font-black uppercase tracking-[0.16em] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A3FF12]/45 sm:px-3.5 sm:text-[11px]",
              isActive
                ? "border-[#A3FF12]/30 bg-[#A3FF12]/12 text-white shadow-[0_12px_28px_rgba(163,255,18,0.12)]"
                : "border-white/10 bg-white/[0.035] text-white/72 hover:border-[#A3FF12]/24 hover:bg-white/[0.055] hover:text-white"
            )}
          >
            <Icon className={cn("h-4 w-4", isActive ? "text-[#d7ffab]" : "text-white/54")} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
