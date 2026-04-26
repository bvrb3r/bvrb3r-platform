import type { ReactNode } from "react";
import { ClientAppHeader } from "@/components/client-experience/client-app-header";
import { ClientBottomNav } from "@/components/client-experience/client-bottom-nav";
import { ClientSidebar } from "@/components/client-experience/client-sidebar";
import type {
  ClientAppMode,
  ClientAppTab
} from "@/components/client-experience/client-tab-config";

export function ClientAppShell({
  activeTab,
  children,
  mode = "client"
}: {
  activeTab?: ClientAppTab;
  children: ReactNode;
  mode?: ClientAppMode;
}) {
  return (
    <div className="bvr-screen app-screen relative overflow-x-clip text-[var(--text-primary)]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_top,rgba(124,255,0,0.12),transparent_62%)]" />
        <div className="absolute -left-20 top-32 h-48 w-48 rounded-full bg-white/[0.03] blur-3xl" />
        <div className="absolute -right-16 top-24 h-56 w-56 rounded-full bg-[#7CFF00]/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-56 w-[34rem] -translate-x-1/2 bg-[radial-gradient(circle_at_center,rgba(124,255,0,0.08),transparent_70%)]" />
      </div>
      <div className="relative page-shell safe-top-pad app-safe-bottom pb-[calc(env(safe-area-inset-bottom,0px)+6.5rem)] pt-3 sm:pt-4">
        <ClientAppHeader mode={mode} />
        <div className="mt-4 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-5">
          {mode === "client" ? <ClientSidebar activeTab={activeTab} /> : null}
          <main className="min-w-0 space-y-4 sm:space-y-5">{children}</main>
        </div>
      </div>
      <ClientBottomNav activeTab={activeTab} mode={mode} />
    </div>
  );
}
