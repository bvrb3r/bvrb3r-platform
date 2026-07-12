"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, RefreshCw, Smartphone, WalletCards } from "lucide-react";

type TerminalStatus = {
  ok: boolean;
  connect: {
    connected: boolean;
    onboardingStatus: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    payoutReadinessStatus: string;
    requirementsCurrentlyDue: unknown[];
    disabledReason: string | null;
    lastSyncedAt: string | null;
    ready: boolean;
    payoutsReady: boolean;
  };
  terminal: {
    nativeDeviceReady: boolean;
    featureEnabled: boolean;
    tapToPayReady: boolean;
    platform: string | null;
    appVersion: string | null;
    lastSeenAt: string | null;
    requirement: string | null;
  };
  environment: {
    mode: "live" | "test" | "missing";
    livePaymentsAllowed: boolean;
  };
};

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function BarberStripeTerminalSettings() {
  const [status, setStatus] = useState<TerminalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<"connect" | "refresh" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/barber/terminal/status", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load payment readiness.");
      setStatus(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load payment readiness.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function startStripeOnboarding() {
    setAction("connect");
    setError(null);
    try {
      const response = await fetch("/api/barber/payouts/onboarding-link", { method: "POST" });
      const payload = await response.json();
      const url = payload.url ?? payload.onboardingUrl ?? payload.data?.url;
      if (!response.ok || !url) throw new Error(payload.error || "Unable to start Stripe setup.");
      window.location.assign(url);
    } catch (onboardingError) {
      setError(onboardingError instanceof Error ? onboardingError.message : "Unable to start Stripe setup.");
      setAction(null);
    }
  }

  async function refreshStripe() {
    setAction("refresh");
    setError(null);
    try {
      const response = await fetch("/api/barber/payouts/sync", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to refresh Stripe status.");
      await loadStatus();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to refresh Stripe status.");
    } finally {
      setAction(null);
    }
  }

  const connectReady = status?.connect.ready === true;
  const terminalReady = status?.terminal.tapToPayReady === true;

  return (
    <section id="stripe-tap-to-pay" className="mb-6 rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-2xl backdrop-blur-xl sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Barber Business Settings</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Stripe & Tap to Pay</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
            Connect your own Stripe account, receive Barber payouts, and activate in-person contactless checkout on an approved native device.
          </p>
        </div>
        <WalletCards className="h-6 w-6 shrink-0 text-emerald-300" aria-hidden="true" />
      </div>

      {loading ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">Checking Stripe readiness…</div>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-white/70" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-white">Stripe Connect</p>
                <p className="text-xs text-white/50">Identity, bank account, charges and payouts</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-sm text-white/60">Status</span>
              <span className={connectReady ? "text-sm font-semibold text-emerald-300" : "text-sm font-semibold text-amber-300"}>
                {connectReady ? "Charges ready" : statusLabel(status?.connect.onboardingStatus ?? "not_started")}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-sm text-white/60">Payouts</span>
              <span className={status?.connect.payoutsReady ? "text-sm font-semibold text-emerald-300" : "text-sm font-semibold text-white/70"}>
                {status?.connect.payoutsReady ? "Ready" : statusLabel(status?.connect.payoutReadinessStatus ?? "not_ready")}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-white/70" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-white">Tap to Pay device</p>
                <p className="text-xs text-white/50">Native iPhone or Android Terminal connection</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-sm text-white/60">Status</span>
              <span className={terminalReady ? "text-sm font-semibold text-emerald-300" : "text-sm font-semibold text-amber-300"}>
                {terminalReady ? "Ready" : status?.terminal.nativeDeviceReady ? "Activation pending" : "Native device required"}
              </span>
            </div>
            {status?.terminal.requirement ? <p className="mt-3 text-xs leading-5 text-white/50">{status.terminal.requirement}</p> : null}
          </div>
        </div>
      )}

      {status?.environment.mode !== "live" ? (
        <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
          Stripe is not in live payment mode. Real Tap to Pay charges remain blocked.
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="mt-4 rounded-2xl border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-100">{error}</div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={startStripeOnboarding}
          disabled={action !== null}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {action === "connect" ? "Opening Stripe…" : connectReady ? "Manage Stripe setup" : "Connect Stripe"}
        </button>
        <button
          type="button"
          onClick={refreshStripe}
          disabled={action !== null}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/15 px-5 text-sm font-semibold text-white transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={action === "refresh" ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
          Refresh status
        </button>
      </div>

      <p className="mt-4 text-xs leading-5 text-white/40">
        Tap to Pay remains locked until Stripe charges are enabled, the native device is approved, and the production feature gate is active. A web browser cannot bypass this control.
      </p>
    </section>
  );
}