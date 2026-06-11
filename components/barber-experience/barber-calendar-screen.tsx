import Link from "next/link";
import { Images } from "lucide-react";
import { BarberScheduleWorkspace } from "@/components/operations/barber-schedule-workspace";
import { GlassCard } from "@/design/components";
import type { BarberSubtype } from "@/types/domain";

export function BarberCalendarScreen({
  barberName
}: {
  barberName: string;
  barberTitle: string;
  barberSubtype?: BarberSubtype;
}) {
  return (
    <div className="space-y-4" data-testid="barber-calendar-screen">
      <BarberScheduleWorkspace barberName={barberName} surface="calendar" />
      <GlassCard className="mb-4 border-[#A3FF12]/16 bg-[linear-gradient(135deg,rgba(163,255,18,0.08),rgba(8,8,8,0.96)_52%,rgba(0,0,0,0.98))] p-6 shadow-[0_22px_70px_rgba(0,0,0,0.35)]" data-testid="barber-home-culture-entry">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#A3FF12]/24 bg-[#A3FF12]/10 text-[#A3FF12]">
              <Images className="h-5 w-5" />
            </div>
            <p className="mt-4 text-xs font-black uppercase tracking-[0.22em] text-[#A3FF12]">Culture</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.04em] text-white">Culture Feed</h2>
            <p className="mt-3 text-sm leading-6 text-white/62">
              Post cuts, discover styles, follow barbers, and turn attention into bookings.
            </p>
          </div>
          <Link
            href="/dashboard/barber/culture"
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#A3FF12] px-5 text-sm font-black text-black transition hover:bg-[#8de300]"
          >
            Open Culture
          </Link>
        </div>
      </GlassCard>
    </div>
  );
}
