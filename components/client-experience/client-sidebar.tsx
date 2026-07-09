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
        <nav
          aria-label="Client primary navigation"
          className="bvr-glass-card rounded-[28px] p-3"
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
                    "flex min-h-12 items-center gap-3 rounded-[20px] border px-4 py-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C4F24E]/45",
                    isActive
                      ? "border-[#e4f9b8]/22 bg-[linear-gradient(135deg,rgba(196, 242, 78,0.18),rgba(10,10,10,0.96))] text-white shadow-[0_16px_32px_rgba(196, 242, 78,0.08)]"
                      : "border-transparent text-white/66 hover:border-white/8 hover:bg-black/22 hover:text-white"
                  )}
                >
                  <div className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-[14px] border transition",
                    isActive
                      ? "border-[#e4f9b8]/22 bg-[#e4f9b8]/10 text-[#e4f9b8]"
                      : "border-white/8 bg-black/18 text-white/60"
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{item.label}</p>
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
