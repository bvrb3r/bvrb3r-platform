import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AppShell({
  sidebar,
  header,
  children,
  bottomNav,
  className
}: {
  sidebar?: ReactNode;
  header?: ReactNode;
  children: ReactNode;
  bottomNav?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bvr-screen safe-top-pad px-2 py-2 sm:px-3 sm:py-3 lg:px-5 lg:py-5", className)}>
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[290px_minmax(0,1fr)] 2xl:grid-cols-[310px_minmax(0,1fr)]">
        {sidebar ? <aside className="hidden lg:block">{sidebar}</aside> : null}
        <main className="min-w-0 space-y-5">
          {header}
          {children}
        </main>
      </div>
      {bottomNav}
    </div>
  );
}
