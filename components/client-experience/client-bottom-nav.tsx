import Link from "next/link";
import type {
  ClientAppMode,
  ClientAppTab
} from "@/components/client-experience/client-tab-config";
import {
  CLIENT_PRIMARY_NAV_ITEMS,
  GUEST_CLIENT_NAV_ITEMS
} from "@/components/client-experience/client-tab-config";
import { cn } from "@/lib/utils";

export function ClientBottomNav({ activeTab, mode = "client" }: { activeTab?: ClientAppTab; mode?: ClientAppMode }) {
  const items = mode === "guest"
    ? GUEST_CLIENT_NAV_ITEMS
    : CLIENT_PRIMARY_NAV_ITEMS;

  return (
    <div className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] z-50 sm:inset-x-3 lg:hidden">
      <nav className="mobile-dock mx-auto flex max-w-[88rem] items-center gap-2 rounded-[28px] border border-white/10 px-3 py-3 shadow-[0_22px_44px_rgba(0,0,0,0.42)]" aria-label={mode === "guest" ? "Guest mobile navigation" : "Client mobile navigation"}>
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === activeTab;

          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[22px] px-2 py-2.5 text-center transition",
                isActive
                  ? "border border-[#7CFF00]/26 bg-[#7CFF00]/10 text-white"
                  : "border border-white/8 bg-black/18 text-white/66 hover:border-[#7CFF00]/20 hover:text-white"
              )}
            >
              <Icon className={cn("h-4 w-4", isActive ? "text-[#d7ffab]" : "text-white/62")} />
              <span className="max-w-full truncate text-[10px] font-semibold uppercase leading-none tracking-[0.14em]">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}


