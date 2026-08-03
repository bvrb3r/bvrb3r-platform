import { Card } from "@/components/ui/card";
import {
  CANONICAL_PLAN_PRICING,
  CANONICAL_PLAN_TIERS,
  formatPlanAmount,
  PLAN_ROLE_LABELS
} from "@/lib/entitlements/plans";
import type { EntitlementAccountRole, EntitlementTier } from "@/lib/entitlements/domain";

const roleOrder = ["client_user", "barber_user", "shop_owner_user"] as const satisfies readonly EntitlementAccountRole[];

const tierCopy: Record<EntitlementTier, string> = {
  standard: "The core BVRB3R loop stays open with no subscription charge.",
  pro: "Advanced operating, retention, analytics, and growth tools.",
  elite: "The highest released level of intelligence, scale, and priority tools."
};

export default function PricingPage() {
  return (
    <section className="page-shell safe-top-pad app-safe-bottom py-6 sm:py-8 lg:py-12">
      <div className="max-w-3xl">
        <p className="text-sm font-black uppercase tracking-[0.28em] text-[#d9f985]">Plans</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl lg:text-5xl">
          Standard. Pro. Elite.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-white/62">
          Standard is always $0 for Clients, Barbers, and Shop Owners. Pro and Elite prices follow the account role and unlock only after verified billing.
        </p>
      </div>

      <div className="mt-10 space-y-10">
        {roleOrder.map((role) => (
          <section key={role} aria-labelledby={`${role}-plans`}>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-white/42">Account role</p>
                <h2 id={`${role}-plans`} className="mt-2 text-2xl font-black tracking-[-0.03em] text-white">
                  {PLAN_ROLE_LABELS[role]}
                </h2>
              </div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#d9f985]">Annual · Save two months</p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {CANONICAL_PLAN_TIERS.map((tier) => {
                const plan = CANONICAL_PLAN_PRICING[role][tier];
                const standard = tier === "standard";
                return (
                  <Card
                    key={tier}
                    className={standard
                      ? "rounded-[30px] border-[#d9f985]/34 bg-[#d9f985]/[0.055] p-6"
                      : "rounded-[30px] border-white/10 bg-white/[0.035] p-6"}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black uppercase tracking-[0.16em] text-white/54">{plan.label}</p>
                      {standard ? (
                        <span className="rounded-full border border-[#d9f985]/30 bg-[#d9f985]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#d9f985]">
                          No card required
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-5 flex items-end gap-1">
                      <p className="text-4xl font-black tracking-[-0.05em] text-white">{formatPlanAmount(plan.monthlyCents)}</p>
                      <p className="pb-1 text-sm text-white/46">{standard ? "forever" : "/ month"}</p>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-white/42">
                      {standard ? "$0 annually" : `${formatPlanAmount(plan.yearlyCents)} / year`}
                    </p>
                    <p className="mt-5 text-sm leading-6 text-white/62">{tierCopy[tier]}</p>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-10 text-sm leading-6 text-white/46">
        Paid plan checkout remains unavailable until the matching Stripe price and server entitlement are verified. A displayed plan never grants access by itself.
      </p>
    </section>
  );
}
