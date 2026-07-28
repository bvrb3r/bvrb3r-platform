"use client";

import { useEffect, useState } from "react";
import { Clock3, Loader2, MapPin, ShieldCheck } from "lucide-react";
import type { PublicQueueStatusView } from "@/lib/rent/service";

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

export function PublicQueueStatus({
  token,
  initialStatus
}: {
  token: string;
  initialStatus: PublicQueueStatusView;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    const interval = window.setInterval(() => {
      if (!active) return;
      setRefreshing(true);
      void fetch(`/api/queue/status/${token}`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) return null;
          return response.json() as Promise<PublicQueueStatusView>;
        })
        .then((next) => {
          if (active && next) setStatus(next);
        })
        .catch(() => null)
        .finally(() => {
          if (active) setRefreshing(false);
        });
    }, 12_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [token]);

  return (
    <main className="min-h-screen bg-[#060706] px-4 py-8 text-white sm:px-6 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-black tracking-[0.32em]">BVRB<span className="text-[#C4F24E]">3</span>R</p>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/42">
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 text-[#C4F24E]" />}
            Live token · {status.queueReference}
          </p>
        </div>

        <section className="mt-8 rounded-[34px] border border-[#C4F24E]/20 bg-[radial-gradient(circle_at_top,rgba(196,242,78,0.10),transparent_28%),rgba(255,255,255,0.025)] p-6 text-center shadow-[0_40px_100px_rgba(0,0,0,0.55)] sm:p-10">
          <div className="mx-auto grid h-28 w-28 place-items-center rounded-full border border-[#C4F24E]/30 bg-[#C4F24E]/8 text-5xl font-semibold text-[#C4F24E]" data-display="true">
            {status.position ?? "—"}
          </div>
          <p className="mt-7 text-[11px] font-black uppercase tracking-[0.28em] text-[#C4F24E]">{status.copy.eyebrow}</p>
          <h1 className="mx-auto mt-3 max-w-xl text-5xl font-semibold tracking-[-0.05em] sm:text-7xl" data-display="true">
            {status.copy.title}
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-sm leading-7 text-white/58">{status.copy.detail}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-white/62">
              <Clock3 className="h-4 w-4 text-[#C4F24E]" />
              {status.estimatedWaitMinutes === null ? "Estimate updating" : `${status.estimatedWaitMinutes} min estimate`}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-white/62">
              <MapPin className="h-4 w-4 text-[#C4F24E]" />
              {status.shopName}
            </span>
          </div>
          {status.state === "reassigned" ? (
            <div className="mx-auto mt-7 max-w-md rounded-[22px] border border-amber-300/20 bg-amber-300/8 p-4 text-sm text-amber-50">
              {status.reassignedBarberLabel ?? "Your new barber"}
              {status.reassignedPrice === null ? "" : ` · ${money(status.reassignedPrice)}`}
            </div>
          ) : null}
        </section>

        <p className="mt-6 text-center text-xs leading-6 text-white/38">
          This private capability link shows only queue status. It never reveals your phone, email, service history, or another guest’s identity.
        </p>
      </div>
    </main>
  );
}
