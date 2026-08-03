import type { Route } from "next";
import Link from "next/link";
import { FeatureGateTease } from "@/components/ui/feature-gate-tease";
import type { FeatureGateKey } from "@/lib/feature-gates";
import type { RoadRole } from "@/lib/road/catalog";

const futureDoors: Record<RoadRole, Array<{
  gateKey: FeatureGateKey;
  label: string;
  detail: string;
}>> = {
  client_user: [
    { gateKey: "client.future.concierge", label: "Concierge", detail: "Natural-language booking opens only after the provider-backed concierge loop is complete." },
    { gateKey: "client.future.retail_marketplace", label: "Retail marketplace", detail: "Retail products stay separate from today’s live barber and shop discovery marketplace." },
    { gateKey: "client.future.family_profiles", label: "Family profiles", detail: "Dependent identity, consent, and payment ownership are still being built." },
    { gateKey: "client.future.open_chair_alerts", label: "Open-chair alerts", detail: "Saved alert rules need server delivery caps and live-chair eligibility truth." }
  ],
  barber_user: [
    { gateKey: "barber.future.memberships", label: "Barber memberships", detail: "Recurring client membership terms and Stripe lifecycle truth are not open yet." },
    { gateKey: "barber.future.tax_1099_pack", label: "1099 pack", detail: "Tax-document generation stays closed until the reporting and review workflow is production-ready." },
    { gateKey: "barber.future.waitlist_auto_fill", label: "Waitlist auto-fill", detail: "Automatic fills need consent, conflict protection, and delivery proof." },
    { gateKey: "barber.future.retail_split", label: "Retail split", detail: "Retail settlement cannot open until product ownership and payout routing are explicit." }
  ],
  shop_owner_user: [
    { gateKey: "owner.future.tax_1099_pack", label: "1099 tax pack", detail: "Shop tax-document generation remains closed pending reporting review." },
    { gateKey: "owner.future.shift_scheduler", label: "Shift scheduler", detail: "Shift assignment must not overwrite independent barber availability or booked appointments." },
    { gateKey: "owner.future.marketing_blasts", label: "Marketing blasts", detail: "Broadcasts remain consent-bound and plan-gated until delivery controls are complete." },
    { gateKey: "owner.future.inventory", label: "Inventory", detail: "Inventory stays closed until product, location, adjustment, and audit truth are connected." }
  ]
};

export function RoadFutureGates({ role }: { role: RoadRole }) {
  return (
    <section className="space-y-3" aria-label="Future doors" data-testid={`road-future-gates-${role}`}>
      <div>
        <p className="bvr-section-label">Future doors</p>
        <p className="mt-2 text-sm leading-6 text-white/48">Visible, honest, and closed until their real execution paths pass.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {futureDoors[role].map((door) => (
          <FeatureGateTease
            key={door.gateKey}
            gateKey={door.gateKey}
            label={door.label}
            eyebrow="Future"
            detail={door.detail}
            scale="row"
          />
        ))}
        {role === "shop_owner_user" ? (
          <Link
            href={"/gift-cards" as Route}
            className="flex min-h-16 items-center justify-between rounded-[20px] border border-[var(--bvr-green-border)] bg-[var(--bvr-green-soft)] px-4 text-sm text-white/62"
            data-future-door-graduated="owner.gift-cards"
          >
            <span><strong className="text-white">Gift cards</strong><span className="mt-1 block text-xs text-white/48">Graduated from its PR32 gate into the real PR36 gift-card flow.</span></span>
            <span className="rounded-full border border-[var(--bvr-green-border)] px-3 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--bvr-green-text)]">Live</span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}
