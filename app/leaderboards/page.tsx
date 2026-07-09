import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function LeaderboardsPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-4 sm:px-6 lg:px-10 lg:py-8">
      <Card className="rounded-[36px] p-6 sm:p-8">
        <p className="surface-label text-[#e4f9b8]">Marketplace update</p>
        <h1 className="mt-4 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">
          Public leaderboards are parked for soft launch.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-white/64">
          Discovery is live through the canonical marketplace search, barber profile, and booking flow. This older ranking surface is intentionally offline so live users do not hit legacy growth logic.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/discover"
            className="inline-flex items-center gap-2 rounded-full border border-[#e0f6a0]/40 bg-[linear-gradient(135deg,#c4f24e_0%,#d4f97a_100%)] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-black shadow-[0_14px_34px_rgba(196, 242, 78,0.24)] transition hover:translate-y-[-1px]"
          >
            Open discover
          </Link>
          <Link
            href="/dashboard/client/search"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-white transition hover:border-[#C4F24E]/24 hover:text-[#e4f9b8]"
          >
            <ArrowLeft className="h-4 w-4" />
            Search live barbers
          </Link>
        </div>
      </Card>
    </main>
  );
}
