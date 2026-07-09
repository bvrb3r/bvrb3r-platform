import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { ArchitectPrimaryNav } from "@/components/architect-experience/architect-primary-nav";
import { LogoutButton } from "@/components/auth/logout-button";
import { GlassCard } from "@/design/components";
import { getPlatformAdminUser } from "@/lib/auth/guards";

export default async function ArchitectLayout({ children }: { children: React.ReactNode }) {
  const user = await getPlatformAdminUser();

  return (
    <div className="bvr-screen safe-top-pad overflow-x-clip" data-testid="architect-shell">
      <div className="px-2 pt-2 sm:px-3 sm:pt-3 lg:px-5 lg:pt-4" data-testid="architect-header-shell">
        <div className="mx-auto max-w-7xl">
          <GlassCard className="relative overflow-hidden rounded-[28px] p-3 sm:p-4">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(196, 242, 78,0.09),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(196, 242, 78,0.045),transparent_28%)]" />
            <div className="relative flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-[#C4F24E]/22 bg-[linear-gradient(135deg,rgba(196, 242, 78,0.18),rgba(8,8,8,0.95))] text-xs font-black tracking-[0.2em] text-[#e4f9b8] shadow-[0_18px_42px_rgba(196, 242, 78,0.14)]">
                  BVR
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-[8px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#e4f9b8]">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Architect session
                    </span>
                    <Link href="/architect" className="rounded-[8px] border border-white/10 bg-black/24 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-white/68 transition hover:border-[#C4F24E]/24 hover:text-white">
                      Mission Control
                    </Link>
                  </div>
                  <div className="mt-2 min-w-0">
                    <p className="truncate text-lg font-black tracking-[-0.02em] text-white">{user.name}</p>
                    <p className="mt-0.5 truncate text-sm text-white/58">{user.email}</p>
                  </div>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-white/56">Executive truth, workflow health, source vault, action boundaries, and Hive AI agents.</p>
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-3 xl:min-w-[34rem] xl:items-end">
                <div className="w-full xl:max-w-[48rem]">
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
    </div>
  );
}
