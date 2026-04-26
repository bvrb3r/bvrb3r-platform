"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CircleDollarSign,
  ReceiptText,
  Scissors,
  WalletCards
} from "lucide-react";
import { ServiceCatalogWorkspace } from "@/components/marketplace/service-catalog-workspace";
import { BarberEarningsWorkspace } from "@/components/operations/barber-earnings-workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { DataStatCard, FilterChip, PageHeader, StatusBadge } from "@/design/components";
import { useMarketplaceServiceCatalog } from "@/lib/marketplace/client";
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
type CheckoutPanelKey = "keypad" | "appointments" | "services";

function normalizeCheckoutSection(section?: string): CheckoutSectionKey | null {
  if (section === "money") {
    return "earnings";
  }

  return section && section in sectionIdMap ? (section as CheckoutSectionKey) : null;
}

function normalizeCheckoutPanel(section?: string): CheckoutPanelKey {
  if (section === "appointments") {
    return "appointments";
  }

  if (section === "services") {
    return "services";
  }

  return "keypad";
}

function digitsToAmount(digits: string) {
  return Number(digits || "0") / 100;
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
  const serviceCatalogQuery = useMarketplaceServiceCatalog();
  const payload = overviewQuery.data;
  const todayAppointments = payload?.todayAppointments ?? [];
  const readyForCheckout = todayAppointments.filter((appointment) => appointment.status === "completed" && appointment.financial.outstandingBalance > 0);
  const paidAppointments = todayAppointments.filter((appointment) => appointment.financial.capturedAmount > 0 || appointment.financial.tipAmount > 0);
  const selectedSection = normalizeCheckoutSection(initialSection);
  const [activePanel, setActivePanel] = useState<CheckoutPanelKey>(() => normalizeCheckoutPanel(initialSection));
  const [chargeDigits, setChargeDigits] = useState("0");
  const [selectedServiceLabel, setSelectedServiceLabel] = useState<string | null>(null);
  const [panelFeedback, setPanelFeedback] = useState<{ tone: "info" | "error"; message: string } | null>(null);
  const keypadAmount = digitsToAmount(chargeDigits);
  const serviceShortcuts = useMemo(
    () => [...(serviceCatalogQuery.data?.editableServices ?? []), ...(serviceCatalogQuery.data?.readOnlyServices ?? [])].slice(0, 8),
    [serviceCatalogQuery.data]
  );

  useEffect(() => {
    setActivePanel(normalizeCheckoutPanel(initialSection));
  }, [initialSection]);

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

  function appendDigit(digit: string) {
    setChargeDigits((current) => {
      if (current === "0") {
        return digit;
      }

      return `${current}${digit}`.slice(0, 7);
    });
  }

  function backspaceDigit() {
    setChargeDigits((current) => {
      if (current.length <= 1) {
        return "0";
      }

      return current.slice(0, -1);
    });
  }

  function clearQuickCharge() {
    setChargeDigits("0");
    setSelectedServiceLabel(null);
    setPanelFeedback(null);
  }

  function openDetailSection(section: CheckoutSectionKey) {
    setActivePanel(section === "services" ? "services" : "appointments");
    const target = document.getElementById(sectionIdMap[section]);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleQuickCharge() {
    if (keypadAmount <= 0) {
      setPanelFeedback({ tone: "error", message: "Enter an amount or load a service before opening checkout." });
      return;
    }

    setPanelFeedback({
      tone: "info",
      message: "Barber self-capture is not a separate canonical rail yet. Use the shared checkout flow for live payment capture."
    });
    openDetailSection("appointments");
  }

  function handleLoadService(service: (typeof serviceShortcuts)[number]["service"]) {
    setChargeDigits(String(Math.round(Number(service.price) * 100)));
    setSelectedServiceLabel(service.name);
    setPanelFeedback({
      tone: "info",
      message: `${service.name} loaded into Quick Charge. Live capture still follows the shared canonical checkout rail.`
    });
    setActivePanel("keypad");
  }

  return (
    <div className="space-y-4" data-testid="barber-checkout-screen">
      {panelFeedback ? (
        <FeedbackBanner tone={panelFeedback.tone} message={panelFeedback.message} />
      ) : null}
      {overviewQuery.error ? (
        <FeedbackBanner tone="error" message={getReadableActionError(overviewQuery.error)} />
      ) : null}

      <Card className="rounded-[32px] p-6">
        <PageHeader
          label="Checkout"
          title="Checkout"
          subtitle="Charge clients, close appointments, and track payments."
          action={
            <div className="rounded-[24px] border border-[#7cff00]/16 bg-[#7cff00]/10 px-4 py-3 text-right">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">{barberName}</p>
              <p className="mt-2 text-sm font-medium text-white">
                {payload?.earnings.outstandingCheckoutCount ?? readyForCheckout.length} ticket{(payload?.earnings.outstandingCheckoutCount ?? readyForCheckout.length) === 1 ? "" : "s"} need follow-up
              </p>
              <p className="mt-1 text-sm text-white/58">
                {currency(payload?.earnings.grossSales ?? 0)} posted today
              </p>
            </div>
          }
        />

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

      <section className="grid gap-3 sm:grid-cols-3">
        <DataStatCard
          label="Ready now"
          value={readyForCheckout.length}
          detail="Completed tickets awaiting closeout"
          icon={<CircleDollarSign className="h-4 w-4" />}
        />
        <DataStatCard
          label="Paid today"
          value={paidAppointments.length}
          detail="Captured appointments and receipts"
          icon={<ReceiptText className="h-4 w-4" />}
        />
        <DataStatCard
          label="Service rail"
          value={serviceShortcuts.length}
          detail={barberRole === "booth_rent_barber" ? "Editable barber services" : "Readable service pricing"}
          icon={<Scissors className="h-4 w-4" />}
        />
      </section>

      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="surface-label">POS flow</p>
            <p className="mt-3 text-2xl font-semibold text-white">Keypad first, then appointment payments and service picks one swipe away.</p>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/62">
              Quick Charge stays visible here without inventing a fake barber-only capture rail. Manual totals, appointment payment state, and service loading all stay in one place.
            </p>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-3 text-right">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">Default panel</p>
            <p className="mt-2 text-sm font-medium text-white">Keypad</p>
            <p className="mt-1 text-sm text-white/58">Swipe to appointment payments or services.</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {([
            { key: "keypad", label: "Keypad" },
            { key: "appointments", label: "Appointment payments" },
            { key: "services", label: "Services" }
          ] as const).map((panel) => (
            <FilterChip
              key={panel.key}
              type="button"
              active={activePanel === panel.key}
              onClick={() => setActivePanel(panel.key)}
            >
              {panel.label}
            </FilterChip>
          ))}
        </div>

        {activePanel === "keypad" ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-[0.94fr_1.06fr]">
            <div className="rounded-[28px] border border-[#7cff00]/16 bg-[linear-gradient(180deg,rgba(124,255,0,0.1),rgba(8,8,8,0.96))] p-5">
              <p className="surface-label text-[#d7ffab]">Quick Charge</p>
              <p className="mt-4 text-[2.8rem] font-semibold tracking-[-0.05em] text-white" data-display="true">
                {currency(keypadAmount)}
              </p>
              <p className="mt-3 text-sm text-white/62">
                {selectedServiceLabel ? `${selectedServiceLabel} loaded into the check.` : "Enter an amount or load a service into the check."}
              </p>

              <div className="mt-5 grid grid-cols-3 gap-3">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => appendDigit(digit)}
                    className="flex h-14 items-center justify-center rounded-[20px] border border-white/8 bg-black/20 text-lg font-semibold text-white transition hover:border-[#7cff00]/18 hover:text-[#d7ffab]"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={clearQuickCharge}
                  className="flex h-14 items-center justify-center rounded-[20px] border border-white/8 bg-black/20 text-sm font-semibold uppercase tracking-[0.18em] text-white/74 transition hover:border-[#7cff00]/18 hover:text-white"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => appendDigit("0")}
                  className="flex h-14 items-center justify-center rounded-[20px] border border-white/8 bg-black/20 text-lg font-semibold text-white transition hover:border-[#7cff00]/18 hover:text-[#d7ffab]"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={backspaceDigit}
                  className="flex h-14 items-center justify-center rounded-[20px] border border-white/8 bg-black/20 text-sm font-semibold uppercase tracking-[0.18em] text-white/74 transition hover:border-[#7cff00]/18 hover:text-white"
                >
                  Del
                </button>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Button type="button" className="h-11 px-5" onClick={handleQuickCharge}>
                  Charge
                </Button>
                <Button type="button" variant="secondary" className="h-11 px-5" onClick={() => openDetailSection("appointments")}>
                  Appointment payments
                </Button>
                <Button type="button" variant="ghost" className="h-11 px-5" onClick={() => setActivePanel("services")}>
                  Load service
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Ready now</p>
                <p className="mt-3 text-2xl font-semibold text-white">{readyForCheckout.length}</p>
                <p className="mt-2 text-sm text-white/58">Completed tickets still waiting on payment closeout.</p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Paid today</p>
                <p className="mt-3 text-2xl font-semibold text-white">{paidAppointments.length}</p>
                <p className="mt-2 text-sm text-white/58">Paid tickets and receipts stay connected to real appointments.</p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Capture rail</p>
                <div className="mt-3">
                  <StatusBadge tone="neutral">Shared canonical flow</StatusBadge>
                </div>
                <p className="mt-2 text-sm text-white/58">Barber-side Quick Charge stays visible, but live capture still hands off to the protected operations checkout rail.</p>
              </div>
            </div>
          </div>
        ) : null}

        {activePanel === "appointments" ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div className="rounded-[28px] border border-white/8 bg-black/20 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="surface-label">Appointment payments</p>
                  <p className="mt-2 text-sm text-white/58">Unpaid and paid appointment tickets stay visible before you jump into the detailed checkout lists below.</p>
                </div>
                <CircleDollarSign className="h-5 w-5 text-[#d7ffab]" />
              </div>
              <div className="mt-4 space-y-3">
                {readyForCheckout.length ? readyForCheckout.slice(0, 3).map((appointment) => (
                  <div key={`panel-ready-${appointment.id}`} className="rounded-[22px] border border-white/8 bg-black/18 p-4">
                    <p className="font-semibold text-white">{appointment.display.clientName}</p>
                    <p className="mt-2 text-sm text-white/58">{appointment.display.serviceName} | {currency(appointment.financial.outstandingBalance)} due</p>
                    <p className="mt-2 text-sm text-white/52">{formatDateTime(appointment.start)}</p>
                  </div>
                )) : (
                  <div className="rounded-[22px] border border-dashed border-white/10 bg-black/18 p-4 text-sm text-white/58">
                    No unpaid completed tickets are waiting right now.
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-[28px] border border-white/8 bg-black/20 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="surface-label">Receipts and paid tickets</p>
                  <p className="mt-2 text-sm text-white/58">Paid appointment history, receipts, and tips stay tied to the real appointment closeout record.</p>
                </div>
                <ReceiptText className="h-5 w-5 text-[#baff69]" />
              </div>
              <div className="mt-4 space-y-3">
                {paidAppointments.length ? paidAppointments.slice(0, 3).map((appointment) => (
                  <div key={`panel-paid-${appointment.id}`} className="rounded-[22px] border border-white/8 bg-black/18 p-4">
                    <p className="font-semibold text-white">{appointment.display.clientName}</p>
                    <p className="mt-2 text-sm text-white/58">{appointment.display.serviceName} | {currency(appointment.financial.capturedAmount || appointment.totalAmount)} collected</p>
                    <p className="mt-2 text-sm text-white/52">Tip {currency(appointment.financial.tipAmount)} | {appointment.financial.latestStatusLabel}</p>
                  </div>
                )) : (
                  <div className="rounded-[22px] border border-dashed border-white/10 bg-black/18 p-4 text-sm text-white/58">
                    No paid appointments have landed yet today.
                  </div>
                )}
              </div>
              <div className="mt-4">
                <Button type="button" variant="secondary" className="h-11 px-5" onClick={() => openDetailSection("appointments")}>
                  Open detailed appointment payments
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {activePanel === "services" ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-[0.96fr_1.04fr]">
            <div className="rounded-[28px] border border-white/8 bg-black/20 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="surface-label">Service selection</p>
                  <p className="mt-2 text-sm text-white/58">Tap a real service to load its price into Quick Charge, then keep the full library and pricing controls one section below.</p>
                </div>
                <Scissors className="h-5 w-5 text-[#d7ffab]" />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {serviceShortcuts.length ? serviceShortcuts.map((item) => (
                  <button
                    key={item.service.id}
                    type="button"
                    onClick={() => handleLoadService(item.service)}
                    className="rounded-[22px] border border-white/8 bg-black/18 p-4 text-left transition hover:border-[#7cff00]/18 hover:bg-black/25"
                  >
                    <p className="font-semibold text-white">{item.service.name}</p>
                    <p className="mt-2 text-sm text-white/58">{currency(item.service.price)} | {item.service.durationMin} min</p>
                    <p className="mt-2 text-sm text-white/52">{item.ownerLabel}</p>
                  </button>
                )) : (
                  <div className="rounded-[22px] border border-dashed border-white/10 bg-black/18 p-4 text-sm text-white/58 sm:col-span-2">
                    No services are visible yet. The canonical service library below will populate as soon as this barber lane has real services attached.
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-[28px] border border-white/8 bg-black/20 p-5">
              <p className="surface-label">Loaded into Quick Charge</p>
              <p className="mt-3 text-2xl font-semibold text-white">{currency(keypadAmount)}</p>
              <p className="mt-2 text-sm text-white/58">
                {selectedServiceLabel ? `${selectedServiceLabel} is ready in Keypad.` : "Choose a service to load its live price into Keypad."}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button type="button" className="h-11 px-5" onClick={() => setActivePanel("keypad")}>
                  Back to Keypad
                </Button>
                <Button type="button" variant="secondary" className="h-11 px-5" onClick={() => openDetailSection("services")}>
                  Open full service library
                </Button>
              </div>
            </div>
          </div>
        ) : null}
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
              More
            </div>
            <p className="mt-3">Payout setup, verification, business model, and private account controls live under More.</p>
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
