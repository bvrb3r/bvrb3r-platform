import { Gift, ShieldCheck } from "lucide-react";
import { FeatureGate } from "@/components/ui/feature-gate";

export function GiftedCutsV3Gate() {
  return (
    <FeatureGate
      reason="building"
      reasonCopy="V3 only — still being built"
      scale="card"
      label="Gifted Cuts · V3"
      note="No gift pool, Stripe charge, redemption, or barber payout exists in this release."
      className="rounded-[24px]"
    >
      <section className="min-h-[15rem] rounded-[24px] border border-[#D9B461]/25 bg-[#D9B461]/[0.045] p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#D9B461]/40 bg-[#D9B461]/10 text-[#D9B461]">
            <Gift className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#D9B461]">Community layer · V3</p>
            <h2 className="mt-2 font-serif text-3xl text-white">Gifted Cuts</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/58">
              The future door will let a community cover services while the eligible service amount follows normal Stripe routing. The 5% BVRB3R platform fee and authorized adjustments still apply; 100% of the client-confirmed tip belongs to the barber.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {["Service only — never the tip", "No expiration or fake pool", "Declines return the cut to the pool"].map((rule) => (
            <div key={rule} className="flex items-start gap-2 rounded-[16px] border border-white/8 bg-black/20 p-3 text-xs leading-5 text-white/58">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#C4F24E]" aria-hidden="true" />
              {rule}
            </div>
          ))}
        </div>
      </section>
    </FeatureGate>
  );
}
