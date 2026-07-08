import type { Route } from "next";
import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type DesignBottomNavItem = {
  key: string;
  label: string;
  href: Route;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

export function BottomNav({
  items,
  activeKey,
  actionHref
}: {
  items: DesignBottomNavItem[];
  activeKey?: string;
  actionHref?: Route;
}) {
  const midpoint = Math.ceil(items.length / 2);
  const before = items.slice(0, midpoint);
  const after = items.slice(midpoint);

  const renderItem = (item: DesignBottomNavItem) => {
    const Icon = item.icon;
    const active = item.key === activeKey;

    return (
      <Link
        key={item.key}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn("flex min-w-0 flex-1 flex-col items-center gap-1 px-2 py-2 text-xs font-semibold", active ? "text-[var(--bvr-green-bright)]" : "text-white/60")}
      >
        <Icon className="h-5 w-5" />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  };

  return (
    <nav className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] z-50 mx-auto flex max-w-xl items-center gap-2 rounded-[28px] border border-white/10 bg-[rgba(10,10,12,0.86)] px-3 py-2 backdrop-blur-2xl lg:hidden">
      {before.map(renderItem)}
      {actionHref ? (
        <Link
          href={actionHref}
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] bg-[var(--bvr-green)] text-[#0a0a0c] shadow-[0_0_40px_var(--bvr-green-glow)]"
          aria-label="Primary action"
        >
          <Plus className="h-7 w-7" />
        </Link>
      ) : null}
      {after.map(renderItem)}
    </nav>
  );
}
