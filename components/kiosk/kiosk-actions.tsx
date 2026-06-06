"use client";

import { useState, type ReactNode } from "react";
import type { Route } from "next";
import { LockKeyhole, TabletSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/design/components";
import { getReadableActionError } from "@/lib/utils/feedback";

async function requestKioskJson<T>(url: string, payload: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!response.ok) {
    const error = new Error(body.error ?? `Request failed with status ${response.status}`) as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = body.code;
    throw error;
  }

  return body as T;
}

export function KioskLaunchAction({
  href,
  scope,
  targetReference,
  children,
  className
}: {
  href: Route;
  scope: "shop" | "barber";
  targetReference: string;
  children: ReactNode;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleLaunch() {
    setError(null);
    setIsPending(true);
    try {
      await requestKioskJson("/api/kiosk/verify-pin", { scope, targetReference, pin });
      setOpen(false);
      window.location.assign(href);
    } catch (launchError) {
      setError(getReadableActionError(launchError as { message?: string; status?: number; code?: string }));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open ? (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/74 px-4 py-5 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="Enter kiosk PIN">
          <div className="w-full max-w-sm rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(4,4,4,0.98))] p-5 text-white shadow-[0_24px_70px_rgba(0,0,0,0.58)]">
            <div className="flex items-start gap-3">
              <span className="rounded-[12px] border border-[#A3FF12]/20 bg-[#A3FF12]/10 p-2 text-[#A3FF12]">
                <LockKeyhole className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">Kiosk Mode</p>
                <h2 className="mt-1 text-2xl font-black tracking-[-0.04em]">Enter kiosk PIN</h2>
                <p className="mt-2 text-sm leading-6 text-white/58">This locks the device into public booking mode.</p>
              </div>
            </div>
            <Input
              className="mt-5 text-center text-2xl tracking-[0.45em]"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="0000"
              aria-label="4-digit kiosk PIN"
            />
            {error ? <div className="mt-4"><FeedbackBanner tone="error" message={error} /></div> : null}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="button" disabled={isPending || pin.length !== 4} onClick={() => void handleLaunch()}>
                {isPending ? "Opening..." : "Open"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function KioskSettingsCard({
  scope,
  targetReference,
  title,
  subtitle
}: {
  scope: "shop" | "barber";
  targetReference: string;
  title: string;
  subtitle: string;
}) {
  const [pin, setPin] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSave() {
    setFeedback(null);
    setIsPending(true);
    try {
      await requestKioskJson("/api/kiosk/settings", { scope, targetReference, pin });
      setPin("");
      setFeedback({ tone: "success", message: "Kiosk PIN saved." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as { message?: string; status?: number; code?: string }) });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <GlassCard className="p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="rounded-[14px] border border-[#A3FF12]/20 bg-[#A3FF12]/10 p-3 text-[#A3FF12]">
          <TabletSmartphone className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">Kiosk Settings</p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-white/58">{subtitle}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-white/42">4-digit PIN</label>
          <Input
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="0000"
            aria-label="Set kiosk PIN"
          />
        </div>
        <Button type="button" disabled={isPending || pin.length !== 4} onClick={() => void handleSave()}>
          {isPending ? "Saving..." : "Save PIN"}
        </Button>
      </div>
      <p className="mt-3 text-xs leading-5 text-white/48">PINs are saved as hashes. Kiosk bookings use existing services, availability, payment, and appointment conflict checks.</p>
      {feedback ? <div className="mt-4"><FeedbackBanner tone={feedback.tone} message={feedback.message} /></div> : null}
    </GlassCard>
  );
}
