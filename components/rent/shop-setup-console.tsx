"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Loader2,
  Power,
  ShieldCheck,
  Smartphone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import type { ShopSetupSnapshot } from "@/lib/rent/service";
import { cn } from "@/lib/utils";

const labels: Record<string, { title: string; detail: string }> = {
  shop_identity: { title: "Shop identity", detail: "Name, logo, address" },
  public_shop_profile: { title: "Public shop profile", detail: "Photos, bio, links" },
  hours_and_closures: { title: "Hours & closures", detail: "Weekly hours, holidays" },
  team_policies: { title: "Team policies", detail: "Walk-ins, rotation duty" },
  walk_in_policy: { title: "Walk-in policy", detail: "Queue mode, no-show rules" },
  kiosk_settings: { title: "Kiosk settings", detail: "Pairing, PIN, booking modes" },
  banking_and_payouts: { title: "Banking & payouts", detail: "Stripe readiness" },
  booth_rent_policy: { title: "Booth-rent policy", detail: "Fixed rent, bilateral terms" },
  active_barber: { title: "Active barber", detail: "At least one approved chair" },
  services_and_pricing: { title: "Services & pricing", detail: "Bookable services" },
  booking_rules: { title: "Booking rules", detail: "Intent-only default, prepay policy" },
  emergency_controls: { title: "Emergency controls", detail: "Disable and recovery path" }
};

export function ShopSetupConsole() {
  const [snapshot, setSnapshot] = useState<ShopSetupSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/shop/setup-gates", { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as ShopSetupSnapshot & { error?: string };
    if (!response.ok) throw new Error(body.error ?? "Unable to load shop setup.");
    setSnapshot(body);
  }, []);

  useEffect(() => {
    let active = true;
    void load()
      .catch((error) => {
        if (active) setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Unable to load shop setup." });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  async function update(key: string, nextStatus: "passed" | "pending") {
    if (!snapshot) return;
    setBusyKey(key);
    setFeedback(null);
    try {
      const response = await fetch("/api/shop/setup-gates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: snapshot.shopId,
          locationId: snapshot.locationId,
          gateKey: key,
          status: nextStatus,
          evidence: {
            source: "owner_console",
            attestedAt: new Date().toISOString()
          }
        })
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to update the setup gate.");
      await load();
      setFeedback({ tone: "success", message: `${labels[key]?.title ?? key} saved to canonical setup truth.` });
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Unable to update the setup gate." });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-5" data-testid="shop-setup-console">
      <section className="rounded-[34px] border border-white/10 bg-[#080a08] p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#C4F24E]">
              Setup checklist · {snapshot?.passedCount ?? 0} of {snapshot?.requiredCount ?? 12} passed
            </p>
            <h1 className="mt-4 text-5xl font-semibold tracking-[-0.05em] text-white sm:text-7xl" data-display="true">
              Open when it’s right.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/58">
              The shop cannot become operational until every required item passes or Architect records a reasoned exception.
            </p>
          </div>
          <span className={cn(
            "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em]",
            snapshot?.operational
              ? "border-[#C4F24E]/30 bg-[#C4F24E]/10 text-[#e3ffad]"
              : "border-amber-300/25 bg-amber-300/10 text-amber-100"
          )}>
            {snapshot?.operational ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {snapshot?.operational ? "Operational" : "Setup gated"}
          </span>
        </div>
        <div className="mt-7 h-2 overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-[#C4F24E] transition-[width]"
            style={{ width: `${((snapshot?.passedCount ?? 0) / (snapshot?.requiredCount ?? 12)) * 100}%` }}
          />
        </div>
      </section>

      {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}
      {loading ? (
        <div className="grid min-h-52 place-items-center rounded-[30px] border border-white/8">
          <Loader2 className="h-7 w-7 animate-spin text-[#C4F24E]" aria-label="Loading setup truth" />
        </div>
      ) : null}

      {!loading && snapshot ? (
        <section className="grid gap-3 lg:grid-cols-2">
          {snapshot.gates.map((gate) => {
            const passed = gate.status === "passed" || gate.status === "approved_exception";
            const copy = labels[gate.key] ?? { title: gate.key, detail: "Required setup gate" };
            return (
              <article
                key={gate.key}
                className={cn(
                  "flex items-center justify-between gap-4 rounded-[24px] border p-5",
                  passed ? "border-[#C4F24E]/20 bg-[#C4F24E]/5" : "border-white/10 bg-white/[0.02]"
                )}
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div className={cn(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-xl border",
                    passed
                      ? "border-[#C4F24E]/35 bg-[#C4F24E] text-black"
                      : "border-white/12 bg-black/25 text-white/45"
                  )}>
                    {passed ? <Check className="h-5 w-5" /> : <Power className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-semibold text-white">{copy.title}</h2>
                    <p className="mt-1 text-xs text-white/45">{copy.detail}</p>
                    {gate.status === "approved_exception" ? (
                      <p className="mt-2 text-xs text-amber-100">Architect exception: {gate.exceptionReason}</p>
                    ) : null}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0 rounded-full"
                  disabled={busyKey !== null}
                  onClick={() => void update(gate.key, passed ? "pending" : "passed")}
                >
                  {busyKey === gate.key ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {passed ? "Reopen" : "Mark ready"}
                </Button>
              </article>
            );
          })}
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { icon: Smartphone, title: "Device pairing", detail: "Pairing token + exit PIN are device-scoped." },
          { icon: ShieldCheck, title: "Intent-only default", detail: "Kiosk books intent unless owner explicitly enables prepay." },
          { icon: Power, title: "Emergency disable", detail: "A disabled kiosk cannot accept a new booking." }
        ].map(({ icon: Icon, title, detail }) => (
          <div key={title} className="rounded-[24px] border border-white/8 bg-black/20 p-5">
            <Icon className="h-5 w-5 text-[#C4F24E]" />
            <h2 className="mt-4 font-semibold text-white">{title}</h2>
            <p className="mt-2 text-xs leading-6 text-white/48">{detail}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
