"use client";

import { BellRing, Check, ChevronLeft, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePwa } from "@/components/pwa/pwa-provider";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";

export function PushPermissionScreen() {
  const router = useRouter();
  const {
    pushSupported,
    pushPermission,
    pushEnabled,
    requestPushPrimer
  } = usePwa();
  const [feedback, setFeedback] = useState<{
    tone: "info" | "error";
    message: string;
  } | null>(null);

  function openPrimer() {
    setFeedback(null);
    const result = requestPushPrimer("notifications");
    if (!result.opened) {
      setFeedback({ tone: "info", message: result.message });
    }
  }

  const blocked = pushPermission === "denied";

  return (
    <main className="min-h-screen bg-[#060708] px-4 pb-16 text-[#F5F1E8] sm:px-6">
      <header className="mx-auto flex max-w-[560px] items-center justify-between border-b border-white/10 py-4">
        <button
          type="button"
          onClick={() => router.push("/notifications")}
          className="flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-white/48"
        >
          <ChevronLeft className="h-4 w-4" /> Notifications
        </button>
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-white/30">
          This device
        </span>
      </header>

      <section className="mx-auto max-w-[480px] pt-14 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-[#C4F24E]/35 text-[#C4F24E]">
          {pushEnabled ? <Check className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}
        </span>
        <p className="mt-7 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#C4F24E]">
          Push Permission
        </p>
        <h1 className="mt-3 font-serif text-[46px] leading-[0.98]">
          {pushEnabled ? "Alerts are live." : "Don’t miss your chair."}
        </h1>
        <p className="mx-auto mt-5 max-w-sm text-sm leading-7 text-white/48">
          Booking changes, payment failures, and “you’re up” queue alerts can reach this device even when BVRB3R is closed.
        </p>

        <div className="mt-8 rounded-2xl border border-white/10 p-5 text-left">
          <div className="flex gap-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 text-white/55">
              <Smartphone className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">
                {!pushSupported
                  ? "Push is unavailable here"
                  : blocked
                    ? "Permission is blocked"
                    : pushEnabled
                      ? "This device is connected"
                      : "Permission has not been granted"}
              </p>
              <p className="mt-2 text-xs leading-6 text-white/43">
                {blocked
                  ? "Open the recovery steps below for instructions matched to this device and browser."
                  : "BVRB3R stores one revocable device subscription. Disabling it removes delivery for this device only."}
              </p>
            </div>
          </div>
        </div>

        {feedback ? <div className="mt-5"><FeedbackBanner tone={feedback.tone} message={feedback.message} /></div> : null}

        {!pushEnabled && pushSupported ? (
          <Button className="mt-8 w-full" onClick={openPrimer}>
            {blocked ? "View recovery steps" : "Review and enable alerts"}
          </Button>
        ) : (
          <Button className="mt-8 w-full" variant="secondary" onClick={() => router.push("/notifications")}>
            Return to notifications
          </Button>
        )}
      </section>
    </main>
  );
}
