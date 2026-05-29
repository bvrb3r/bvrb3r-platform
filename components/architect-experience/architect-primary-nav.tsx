"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ARCHITECT_PRIMARY_NAV_ITEMS } from "@/components/architect-experience/architect-tab-config";
import { cn } from "@/lib/utils";

function isArchitectNavActive(pathname: string | null, href: string) {
  if (!pathname) {
    return false;
  }

  if (href === "/architect") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ArchitectPrimaryNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Architect primary navigation" className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar xl:flex-wrap xl:justify-end xl:pb-0">
      {ARCHITECT_PRIMARY_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = isArchitectNavActive(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[10px] font-semibold uppercase tracking-[0.18em] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A3FF12]/45 sm:text-[11px]",
              isActive
                ? "border-[#7CFF00]/28 bg-[#7CFF00]/10 text-white shadow-[0_14px_32px_rgba(124,255,0,0.1)]"
                : "border-white/10 bg-black/20 text-white/76 hover:border-[#7CFF00]/20 hover:text-white"
            )}
          >
            <Icon className={cn("h-4 w-4", isActive ? "text-[#d7ffab]" : "text-white/56")} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
