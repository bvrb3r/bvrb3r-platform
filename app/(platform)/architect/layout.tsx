import { ShieldCheck } from "lucide-react";
import { ArchitectPrimaryNav } from "@/components/architect-experience/architect-primary-nav";
import { LogoutButton } from "@/components/auth/logout-button";
import { GlassCard } from "@/design/components";
import { getPlatformAdminUser } from "@/lib/auth/guards";

export default async function ArchitectLayout({ children }: { children: React.ReactNode }) {
  const user = await getPlatformAdminUser();

  return (
    <>
      <div className="bvr-screen overflow-x-clip px-3 pt-3 sm:px-4 sm:pt-4 lg:px-5 lg:pt-5">
        <div className="mx-auto max-w-[88rem]">
          <GlassCard className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#7CFF00]/18 bg-[#7CFF00]/8 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">
                  <ShieldCheck className="h-4 w-4" />
                  Architect session
                </div>
                <div className="mt-3 min-w-0">
                  <p className="text-lg font-semibold text-white">{user.name}</p>
                  <p className="mt-1 truncate text-sm text-white/60">{user.email}</p>
                </div>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-white/58">Mission Control for users, verification, money, debug, reports, and platform settings.</p>
              </div>

              <div className="flex min-w-0 flex-col gap-3 xl:min-w-[31rem] xl:items-end">
                <div className="w-full xl:max-w-[44rem]">
                  <ArchitectPrimaryNav />
                </div>
                <div className="w-full xl:w-auto">
                  <LogoutButton compact className="xl:min-w-[11.5rem]" />
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
      {children}
    </>
  );
}
