import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  CLIENT_PRIMARY_NAV_ITEMS,
  type ClientAppTab
} from "@/components/client-experience/client-tab-config";

export function ClientSidebar({ activeTab }: { activeTab?: ClientAppTab }) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-5 space-y-4">
        <div className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,15,15,0.96),rgba(8,8,8,0.98))] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
          <p className="text-[10px] uppercase tracking-[0.24em] text-[#d7ffab]">Client navigation</p>
          <p className="mt-3 text-xl font-semibold text-white">Book, track, message, repeat.</p>
          <p className="mt-3 text-sm leading-7 text-white/58">
            Keep the client lane simple: Home for action, Search for discovery, Activity for appointments, Messages for support, Profile for account control.
          </p>
        </div>

        <nav
          aria-label="Client primary navigation"
          className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,15,15,0.96),rgba(8,8,8,0.98))] p-3 shadow-[0_18px_40px_rgba(0,0,0,0.18)]"
        >
          <div className="space-y-2">
            {CLIENT_PRIMARY_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = item.key === activeTab;

              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-[20px] border px-4 py-3 transition",
                    isActive
                      ? "border-[#d7ffab]/22 bg-[linear-gradient(135deg,rgba(124,255,0,0.18),rgba(10,10,10,0.96))] text-white shadow-[0_16px_32px_rgba(124,255,0,0.08)]"
                      : "border-transparent text-white/66 hover:border-white/8 hover:bg-black/22 hover:text-white"
                  )}
                >
                  <div className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-[14px] border transition",
                    isActive
                      ? "border-[#d7ffab]/22 bg-[#d7ffab]/10 text-[#d7ffab]"
                      : "border-white/8 bg-black/18 text-white/60"
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{item.label}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/40">
                      {item.key === "home"
                        ? "Book fast"
                        : item.key === "search"
                          ? "Discover"
                          : item.key === "activity"
                            ? "Manage visits"
                            : item.key === "messages"
                              ? "DMs & support"
                            : "Account controls"}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </aside>
  );
}
