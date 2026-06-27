"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";

const failedLookupCopy = "We could not verify that booking from this screen. Check your confirmation code or contact support with the name, phone, email, and time used when booking.";

export function GuestBookingLookup({
  initialConfirmation = "",
  initialSupport = false
}: {
  initialConfirmation?: string;
  initialSupport?: boolean;
}) {
  const [confirmation, setConfirmation] = useState(initialConfirmation);
  const [contact, setContact] = useState("");
  const [attempted, setAttempted] = useState(false);
  const supportHref = useMemo(() => {
    const subject = confirmation.trim()
      ? `Booking support ${confirmation.trim()}`
      : "Booking support";
    const body = [
      confirmation.trim() ? `Confirmation: ${confirmation.trim()}` : null,
      contact.trim() ? `Email or phone: ${contact.trim()}` : null,
      "Please include the booking name and appointment time."
    ].filter(Boolean).join("\n");
    return `mailto:support@bvrb3r.app?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [confirmation, contact]);
  const canSubmit = confirmation.trim().length >= 4 && contact.trim().length >= 5;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card className="rounded-[34px] p-6 sm:p-8">
        <p className="surface-label text-[#d7ffab]">Booking lookup</p>
        <h1 className="mt-3 text-3xl font-semibold text-white sm:text-5xl" data-display="true">
          Find booking support without exposing private data.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-white/64">
          Enter your confirmation code and the email or phone used when booking. This public screen does not reveal appointment details until a secure lookup path is connected.
        </p>
        {initialSupport ? (
          <div className="mt-5">
            <FeedbackBanner tone="info" message="Need help with a booking? Keep your confirmation code and contact support with the booking name, phone, email, and appointment time." />
          </div>
        ) : null}
        {attempted ? (
          <div className="mt-5">
            <FeedbackBanner tone="info" message={failedLookupCopy} />
          </div>
        ) : null}

        <form
          className="mt-6 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setAttempted(true);
          }}
        >
          <div>
            <label className="surface-label mb-3 block" htmlFor="guest-confirmation-code">Confirmation code</label>
            <Input id="guest-confirmation-code" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
          </div>
          <div>
            <label className="surface-label mb-3 block" htmlFor="guest-contact">Email or phone</label>
            <Input id="guest-contact" value={contact} onChange={(event) => setContact(event.target.value)} autoComplete="email" />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button className="min-h-12 px-5" disabled={!canSubmit}>
              Check booking
            </Button>
            <a href={supportHref} className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 bg-black/25 px-5 text-sm font-semibold text-white transition hover:border-[#7CFF00]/24 hover:text-[#d7ffab]">
              Contact support
            </a>
            <Link href="/discover?entry=guest" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 bg-black/25 px-5 text-sm font-semibold text-white transition hover:border-[#7CFF00]/24 hover:text-[#d7ffab]">
              Back to marketplace
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
