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
        <div className="absolute inset-x-0 top-0 h-64 bg-[linear-gradient(180deg,rgba(196, 242, 78,0.1),transparent_72%)]" />
        <div className="absolute inset-x-0 bottom-0 h-44 bg-[linear-gradient(0deg,rgba(196, 242, 78,0.06),transparent_76%)]" />
      </div>
      <div className="relative page-shell safe-top-pad app-safe-bottom pb-[calc(env(safe-area-inset-bottom,0px)+6.5rem)] pt-3 sm:pt-4 lg:pt-5">
        <ClientAppHeader mode={mode} />
        <div
          className={mode === "client"
            ? "mt-5 lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-5 2xl:grid-cols-[19rem_minmax(0,1fr)]"
            : "mt-5"}
          data-testid="client-app-shell-content"
        >
          {mode === "client" ? <ClientSidebar activeTab={activeTab} /> : null}
          <main className="min-w-0 space-y-5">{children}</main>
        </div>
      </div>
      <ClientBottomNav activeTab={activeTab} mode={mode} />
    </div>
  );
}
