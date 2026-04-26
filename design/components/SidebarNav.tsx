import type { Route } from "next";
import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { GlassCard } from "@/design/components/GlassCard";
import { cn } from "@/lib/utils";

export type DesignNavItem = {
  key: string;
  label: string;
  href: Route;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  eyebrow?: string;
};

export function SidebarNav({ items, activeKey }: { items: DesignNavItem[]; activeKey?: string }) {
  return (
    <GlassCard className="sticky top-4 p-4">
      <nav className="grid gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.key === activeKey;

          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-[22px] border px-3 py-3 text-sm font-extrabold transition duration-200",
                active
                  ? "border-[#a3ff12]/30 bg-[#a3ff12]/12 text-white shadow-[0_14px_34px_rgba(163,255,18,0.12)]"
                  : "border-transparent text-white/68 hover:border-white/10 hover:bg-white/[0.035] hover:text-white"
              )}
            >
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border",
                  active ? "border-[#a3ff12]/35 bg-[#a3ff12]/12 text-[#a3ff12]" : "border-white/10 bg-black/20 text-white/60"
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate">{item.label}</span>
                {item.eyebrow ? <span className="mt-1 block truncate text-[10px] uppercase tracking-[0.18em] text-white/42">{item.eyebrow}</span> : null}
              </span>
            </Link>
          );
        })}
      </nav>
    </GlassCard>
  );
}
