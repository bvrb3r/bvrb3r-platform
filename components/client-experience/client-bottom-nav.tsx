import type { Route } from "next";
import Link from "next/link";
import { CalendarDays, Gift, Home, Search, UserRound } from "lucide-react";
import type { ClientAppTab } from "@/components/client-experience/client-app-shell";
import { cn } from "@/lib/utils";

const navItems: Array<{ key: ClientAppTab; href: Route; label: string; icon: typeof Home }> = [
  { key: "home", href: "/home", label: "Home", icon: Home },
  { key: "search", href: "/search", label: "Search", icon: Search },
  { key: "bookings", href: "/bookings", label: "Bookings", icon: CalendarDays },
  { key: "activity", href: "/activity", label: "Rewards", icon: Gift },
  { key: "profile", href: "/profile", label: "Profile", icon: UserRound }
];

export function ClientBottomNav({ activeTab }: { activeTab?: ClientAppTab }) {
  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] z-50">
      <nav className="mx-auto flex max-w-xl items-center gap-2 rounded-[30px] border border-white/10 bg-[rgba(6,6,6,0.9)] px-3 py-3 backdrop-blur-xl shadow-[0_24px_44px_rgba(0,0,0,0.34)]">
        {navItems.map((item) => {
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


