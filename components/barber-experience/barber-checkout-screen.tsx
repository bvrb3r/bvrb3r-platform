"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  CalendarDays,
  CircleDollarSign,
  ReceiptText,
  Scissors,
  WalletCards
} from "lucide-react";
import { BarberEarningsWorkspace } from "@/components/operations/barber-earnings-workspace";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { ServiceCatalogWorkspace } from "@/components/marketplace/service-catalog-workspace";
import { useBarberOverviewQuery } from "@/lib/operations/barber-client";
import { currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";
import type { Role } from "@/types/domain";

const sectionIdMap = {
  appointments: "barber-checkout-appointments",
  earnings: "barber-checkout-earnings",
  services: "barber-checkout-services"
} as const;

type CheckoutSectionKey = keyof typeof sectionIdMap;

function normalizeCheckoutSection(section?: string): CheckoutSectionKey | null {
  if (section === "money") {
    return "earnings";
  }

  return section && section in sectionIdMap ? (section as CheckoutSectionKey) : null;
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function formatStatusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (segment) => segment.toUpperCase());
}

export function BarberCheckoutScreen({
  barberName,
  barberRole,
  initialSection
}: {
  barberName: string;
  barberRole: Extract<Role, "commission_barber" | "booth_rent_barber">;
  initialSection?: string;
}) {
  const overviewQuery = useBarberOverviewQuery();
  const payload = overviewQuery.data;
  const todayAppointments = payload?.todayAppointments ?? [];
  const readyForCheckout = todayAppointments.filter((appointment) => appointment.status === "completed" && appointment.financial.outstandingBalance > 0);
  const paidAppointments = todayAppointments.filter((appointment) => appointment.financial.capturedAmount > 0 || appointment.financial.tipAmount > 0);
  const selectedSection = normalizeCheckoutSection(initialSection);

  useEffect(() => {
    if (!selectedSection) {
      return;
    }

    const target = document.getElementById(sectionIdMap[selectedSection]);
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedSection]);

  return (
    <div className="space-y-4" data-testid="barber-checkout-screen">
      {overviewQuery.error ? (
        <FeedbackBanner tone="error" message={getReadableActionError(overviewQuery.error)} />
      ) : null}

      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="surface-label">Checkout</p>
            <h3 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">
              {barberName}
            </h3>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/62">
              Keep payment state, paid tickets, services, and payout-visible money in one barber-safe lane.
              {barberRole === "booth_rent_barber"
                ? " Booth-rent service ownership stays editable here without splitting money truth away from the live checkout rail."
                : " Commission pricing stays owner-controlled, but the live payment state still stays readable here."}
            </p>
          </div>
          <div className="rounded-[24px] border border-[#7cff00]/16 bg-[#7cff00]/10 px-4 py-3 text-right">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">Checkout lane</p>
            <p className="mt-2 text-sm font-medium text-white">
              {payload?.earnings.outstandingCheckoutCount ?? readyForCheckout.length} ticket{(payload?.earnings.outstandingCheckoutCount ?? readyForCheckout.length) === 1 ? "" : "s"} need follow-up
            </p>
            <p className="mt-1 text-sm text-white/58">
              {currency(payload?.earnings.grossSales ?? 0)} posted today
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="#barber-checkout-appointments" className="rounded-full border border-white/10 bg-black/20 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/74 transition hover:border-[#7cff00]/20 hover:text-[#d7ffab]">
            Appointment checkout
          </Link>
          <Link href="#barber-checkout-earnings" className="rounded-full border border-white/10 bg-black/20 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/74 transition hover:border-[#7cff00]/20 hover:text-[#d7ffab]">
            Earnings
          </Link>
          <Link href="#barber-checkout-services" className="rounded-full border border-white/10 bg-black/20 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/74 transition hover:border-[#7cff00]/20 hover:text-[#d7ffab]">
            Service library
          </Link>
        </div>
      </Card>

      <section id="barber-checkout-appointments" className="grid scroll-mt-6 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="surface-label">Appointment checkout</p>
              <p className="mt-2 text-sm text-white/58">
                Completed services that still need payment attention stay visible here with no fake closeout state.
              </p>
            </div>
            <CircleDollarSign className="h-5 w-5 text-[#d7ffab]" />
          </div>

          <div className="mt-4 space-y-3">
            {readyForCheckout.length ? readyForCheckout.map((appointment) => (
              <div key={appointment.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-white">{appointment.display.clientName}</p>
                    <p className="mt-2 text-sm text-white/58">
                      {appointment.display.serviceName} | {formatDateTime(appointment.start)}
                    </p>
                    <p className="mt-2 text-sm text-white/52">{appointment.display.locationLabel}</p>
                  </div>
                  <div className="rounded-[18px] border border-white/8 bg-black/18 px-4 py-3 text-right">
                    <p className="surface-label">Balance due</p>
                    <p className="mt-2 text-lg font-semibold text-white">{currency(appointment.financial.outstandingBalance)}</p>
                    <p className="mt-1 text-sm text-white/52">{appointment.financial.latestStatusLabel}</p>
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-black/18 p-5 text-sm leading-7 text-white/58">
                No completed tickets are waiting on checkout right now.
              </div>
            )}
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="surface-label">Quick charge posture</p>
              <p className="mt-2 text-sm text-white/58">
                Barber self-serve charging is not exposed here unless the live operations rail explicitly supports it.
              </p>
            </div>
            <WalletCards className="h-5 w-5 text-[#baff69]" />
          </div>

          <div className="mt-4 rounded-[24px] border border-white/8 bg-black/20 p-4">
            <p className="text-lg font-semibold text-white">Use the current canonical closeout path.</p>
            <p className="mt-3 text-sm leading-7 text-white/60">
              Today&apos;s live payment capture still runs through the shared checkout rail used by front desk, manager, and owner.
              This barber lane keeps the money state visible without inventing a second charge path.
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Ready now</p>
              <p className="mt-3 text-2xl font-semibold text-white">{readyForCheckout.length}</p>
              <p className="mt-2 text-sm text-white/58">Tickets still waiting on payment closeout.</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Paid today</p>
              <p className="mt-3 text-2xl font-semibold text-white">{paidAppointments.length}</p>
              <p className="mt-2 text-sm text-white/58">Completed tickets with captured payment or tip history.</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Service library</p>
              <p className="mt-3 text-2xl font-semibold text-white">{payload?.todayAppointments.length ?? 0}</p>
              <p className="mt-2 text-sm text-white/58">Appointments today tied back to live services and pricing.</p>
            </div>
          </div>
        </Card>
      </section>

      <Card className="rounded-[32px] p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="surface-label">Paid appointments</p>
            <p className="mt-2 text-sm text-white/58">
              Receipts and paid ticket context stay connected to the appointment record instead of floating as separate fake money rows.
            </p>
          </div>
          <ReceiptText className="h-5 w-5 text-[#baff69]" />
        </div>

        <div className="mt-4 space-y-3">
          {paidAppointments.length ? paidAppointments.map((appointment) => (
            <div key={`paid-${appointment.id}`} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-white">{appointment.display.clientName}</p>
                  <p className="mt-2 text-sm text-white/58">
                    {appointment.display.serviceName} | {formatDateTime(appointment.start)}
                  </p>
                  <p className="mt-2 text-sm text-white/52">
                    {appointment.financial.latestStatusLabel} | Tip {currency(appointment.financial.tipAmount)}
                  </p>
                </div>
                <div className="rounded-[18px] border border-white/8 bg-black/18 px-4 py-3 text-right">
                  <p className="surface-label">Collected</p>
                  <p className="mt-2 text-lg font-semibold text-white">{currency(appointment.financial.capturedAmount || appointment.totalAmount)}</p>
                  <p className="mt-1 text-sm text-white/52">{formatStatusLabel(appointment.status)}</p>
                </div>
              </div>
            </div>
          )) : (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-black/18 p-5 text-sm leading-7 text-white/58">
              No paid appointments have landed yet today. Completed paid tickets will appear here once the live checkout rail closes them.
            </div>
          )}
        </div>
      </Card>

      <div id="barber-checkout-earnings" className="scroll-mt-6">
        <BarberEarningsWorkspace barberName={barberName} />
      </div>

      <div id="barber-checkout-services" className="scroll-mt-6">
        <ServiceCatalogWorkspace role={barberRole} />
      </div>

      <Card className="rounded-[32px] p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="surface-label">What lives here</p>
            <p className="mt-2 text-sm text-white/58">
              Checkout keeps payment state, paid tickets, services, and money clarity together without turning Profile or Calendar into finance surfaces.
            </p>
          </div>
          <Scissors className="h-5 w-5 text-[#d7ffab]" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[20px] border border-white/8 bg-black/20 p-4 text-sm leading-6 text-white/66">
            <div className="inline-flex items-center gap-2 text-white/78">
              <CircleDollarSign className="h-4 w-4 text-[#d7ffab]" />
              Checkout
            </div>
            <p className="mt-3">Payment state, paid tickets, receipts, and service-money posture.</p>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-black/20 p-4 text-sm leading-6 text-white/66">
            <div className="inline-flex items-center gap-2 text-white/78">
              <CalendarDays className="h-4 w-4 text-[#baff69]" />
              Calendar
            </div>
            <p className="mt-3">Schedule control, blocked time, weekly hours, and appointment timing.</p>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-black/20 p-4 text-sm leading-6 text-white/66">
            <div className="inline-flex items-center gap-2 text-white/78">
              <WalletCards className="h-4 w-4 text-[#d7ffab]" />
              Profile settings
            </div>
            <p className="mt-3">Payout setup, verification, business model, and private account controls live under Profile.</p>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-black/20 p-4 text-sm leading-6 text-white/66">
            <div className="inline-flex items-center gap-2 text-white/78">
              <Scissors className="h-4 w-4 text-[#baff69]" />
              Profile
            </div>
            <p className="mt-3">Public barber identity, discovery media, review proof, and client-facing trust.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
