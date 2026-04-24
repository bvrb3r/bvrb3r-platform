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
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] z-50 lg:hidden">
      <nav className="mx-auto flex max-w-xl items-center gap-2 rounded-[30px] border border-white/10 bg-[rgba(6,6,6,0.9)] px-3 py-3 backdrop-blur-xl shadow-[0_24px_44px_rgba(0,0,0,0.34)]">
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
                  ? "bg-[linear-gradient(135deg,rgba(124,255,0,0.18),rgba(16,16,16,0.96))] text-white shadow-[0_14px_32px_rgba(124,255,0,0.12)]"
                  : "text-white/54 hover:bg-white/[0.04] hover:text-white"
              )}
            >
              <Icon className={cn("h-4 w-4", isActive ? "text-[#d7ffab]" : "text-white/62")} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}


