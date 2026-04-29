"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgePercent,
  CircleDollarSign,
  CreditCard,
  History,
  Plus,
  ReceiptText,
  Scissors,
  WalletCards
} from "lucide-react";
import { ServiceCatalogWorkspace } from "@/components/marketplace/service-catalog-workspace";
import { BarberEarningsWorkspace } from "@/components/operations/barber-earnings-workspace";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { ActionButton, GlassCard, StatusBadge } from "@/design/components";
import { useMarketplaceServiceCatalog } from "@/lib/marketplace/client";
import { useBarberOverviewQuery } from "@/lib/operations/barber-client";
import { cn, currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";
import type { Role } from "@/types/domain";

const sectionIdMap = {
  appointments: "barber-checkout-appointments",
  earnings: "barber-checkout-earnings",
  services: "barber-checkout-services"
} as const;

const checkoutPanels = [
  { key: "appointments", label: "Appointments" },
  { key: "keypad", label: "Keypad" },
  { key: "services", label: "Library" }
] as const;

const quickAmounts = [25, 35, 40] as const;
const keypadButtons = [
  { key: "1", label: "1" },
  { key: "2", label: "2", sublabel: "ABC" },
  { key: "3", label: "3", sublabel: "DEF" },
  { key: "4", label: "4", sublabel: "GHI" },
  { key: "5", label: "5", sublabel: "JKL" },
  { key: "6", label: "6", sublabel: "MNO" },
  { key: "7", label: "7", sublabel: "PQRS" },
  { key: "8", label: "8", sublabel: "TUV" },
  { key: "9", label: "9", sublabel: "WXYZ" },
  { key: "clear", label: "C" },
  { key: "0", label: "0" },
  { key: "plus", label: "+" }
] as const;

type CheckoutSectionKey = keyof typeof sectionIdMap;
type CheckoutPanelKey = (typeof checkoutPanels)[number]["key"];

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

function amountToDigits(amount: number) {
  return String(Math.round(amount * 100));
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

  function handleQuickAmount(amount: number) {
    setChargeDigits(amountToDigits(amount));
    setPanelFeedback(null);
  }

  function handleReviewSale() {
    if (keypadAmount <= 0) {
      setPanelFeedback({ tone: "error", message: "Enter an amount or load a service before opening checkout." });
      return;
    }

    setPanelFeedback({
      tone: "info",
      message: "Review is ready. Live payment capture still uses the shared canonical checkout rail."
    });
    openDetailSection("appointments");
  }

  function handleLoadService(service: (typeof serviceShortcuts)[number]["service"]) {
    setChargeDigits(amountToDigits(Number(service.price)));
    setSelectedServiceLabel(service.name);
    setPanelFeedback({
      tone: "info",
      message: `${service.name} loaded into Keypad. Live capture still follows the protected checkout rail.`
    });
    setActivePanel("keypad");
  }

  function handleNoteAction() {
    setPanelFeedback({
      tone: "info",
      message: "Notes stay attached during the protected review and appointment checkout flow."
    });
  }

  function handleSecondaryMoneyAction(label: string) {
    setPanelFeedback({
      tone: "info",
      message: `${label} is handled during payment review so discounts, tips, and receipts stay auditable.`
    });
  }

  return (
    <div className="space-y-6" data-testid="barber-checkout-screen">
      {panelFeedback ? <FeedbackBanner tone={panelFeedback.tone} message={panelFeedback.message} /> : null}
      {overviewQuery.error ? <FeedbackBanner tone="error" message={getReadableActionError(overviewQuery.error)} /> : null}

      <GlassCard className="relative overflow-hidden rounded-[32px] p-5 sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(163,255,18,0.10),transparent_30%),radial-gradient(circle_at_bottom_center,rgba(163,255,18,0.06),transparent_28%)]" />
        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="bvr-section-label">Money terminal</p>
              <h2 className="mt-3 text-[2.65rem] font-black leading-none tracking-[-0.045em] text-white sm:text-6xl">
                Checkout
              </h2>
              <p className="mt-2 text-base font-medium text-white/60 sm:text-[17px]">Process payments & close out sales</p>
            </div>
            <button
              type="button"
              aria-label="Open recent checkout history"
              className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white transition hover:border-[#a3ff12]/35 hover:shadow-[0_0_24px_rgba(163,255,18,0.12)]"
              onClick={() => openDetailSection("appointments")}
            >
              <History className="h-6 w-6" />
            </button>
          </div>

          <div className="mt-[30px] grid h-[72px] grid-cols-3 rounded-[14px] border border-white/10 bg-white/[0.025] p-1.5">
            {checkoutPanels.map((panel) => (
              <button
                key={panel.key}
                type="button"
                className={cn(
                  "rounded-[10px] text-sm font-extrabold transition sm:text-base",
                  activePanel === panel.key
                    ? "bg-[linear-gradient(135deg,#a3ff12,#7dce00)] text-[#050505] shadow-[0_0_28px_rgba(163,255,18,0.25)]"
                    : "text-white/70 hover:text-white"
                )}
                onClick={() => setActivePanel(panel.key)}
              >
                {panel.label}
              </button>
            ))}
          </div>

          {activePanel === "keypad" ? (
            <div>
              <section className="mt-[38px]">
                <p className="text-lg font-medium text-white/60">Total Amount</p>
                <p className="mt-2 text-[5.3rem] font-black leading-[0.95] tracking-[-0.07em] text-[#a3ff12] [text-shadow:0_0_34px_rgba(163,255,18,0.24)] sm:text-[6rem]">
                  {currency(keypadAmount)}
                </p>
                {selectedServiceLabel ? <p className="mt-3 text-sm font-semibold text-white/60">{selectedServiceLabel} loaded into the sale.</p> : null}
              </section>

              <section className="mt-7 grid grid-cols-4 gap-2 sm:gap-3">
                <button
                  type="button"
                  className="flex h-[88px] items-center justify-center gap-2 rounded-[12px] border border-white/10 bg-white/[0.035] text-base font-extrabold text-white transition hover:border-[#a3ff12]/25 hover:bg-[#a3ff12]/[0.04] sm:gap-3 sm:text-xl"
                  onClick={handleNoteAction}
                >
                  <Plus className="h-7 w-7 text-[#a3ff12] sm:h-8 sm:w-8" />
                  Note
                </button>
                {quickAmounts.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    className="h-[88px] rounded-[12px] border border-white/10 bg-white/[0.035] text-base font-extrabold text-white transition hover:border-[#a3ff12]/25 hover:bg-[#a3ff12]/[0.04] sm:text-2xl"
                    onClick={() => handleQuickAmount(amount)}
                  >
                    {currency(amount)}
                  </button>
                ))}
              </section>

              <section className="mt-7 overflow-hidden rounded-[18px] border-[1.5px] border-[#a3ff12]/60 bg-white/[0.018] shadow-[0_0_32px_rgba(163,255,18,0.16),inset_0_1px_0_rgba(255,255,255,0.045)]">
                <div className="grid grid-cols-3">
                  {keypadButtons.map((button, index) => (
                    <button
                      key={button.key}
                      type="button"
                      className={cn(
                        "flex h-[150px] flex-col items-center justify-center border-[rgba(163,255,18,0.14)] transition hover:bg-[#a3ff12]/[0.06]",
                        index % 3 !== 2 && "border-r",
                        index < 9 && "border-b"
                      )}
                      onClick={() => {
                        if (button.key === "clear") {
                          clearQuickCharge();
                          return;
                        }

                        if (button.key === "plus") {
                          setActivePanel("services");
                          return;
                        }

                        appendDigit(button.key);
                      }}
                    >
                      <span
                        className={cn(
                          "text-[42px] font-black leading-none tracking-[-0.03em]",
                          button.key === "clear" ? "text-[#ff2d2d]" : button.key === "plus" ? "text-[#a3ff12]" : "text-white"
                        )}
                      >
                        {button.label}
                      </span>
                      {"sublabel" in button ? <span className="mt-2 text-sm font-semibold tracking-[0.22em] text-white/40">{button.sublabel}</span> : null}
                    </button>
                  ))}
                </div>
              </section>

              <section className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  className="flex min-h-[112px] items-center gap-4 rounded-[16px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-4 text-left shadow-[0_14px_42px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-[#a3ff12]/25"
                  onClick={() => handleSecondaryMoneyAction("Discount")}
                >
                  <span className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full border border-[#a3ff12]/65 bg-[rgba(163,255,18,0.08)] text-[#a3ff12] shadow-[0_0_22px_rgba(163,255,18,0.18)]">
                    <BadgePercent className="h-6 w-6" />
                  </span>
                  <span>
                    <span className="block text-xl font-black text-white">Apply Discount</span>
                    <span className="mt-1 block text-[15px] font-medium text-white/60">Add or apply discount</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="flex min-h-[112px] items-center gap-4 rounded-[16px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-4 text-left shadow-[0_14px_42px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-[#a3ff12]/25"
                  onClick={() => handleSecondaryMoneyAction("Tip")}
                >
                  <span className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full border border-[#a3ff12]/65 bg-[rgba(163,255,18,0.08)] text-[#a3ff12] shadow-[0_0_22px_rgba(163,255,18,0.18)]">
                    <ReceiptText className="h-6 w-6" />
                  </span>
                  <span>
                    <span className="block text-xl font-black text-white">Add Tip</span>
                    <span className="mt-1 block text-[15px] font-medium text-white/60">Add gratuity for service</span>
                  </span>
                </button>
              </section>

              <button
                type="button"
                className="mt-[22px] flex min-h-[86px] w-full items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,#a3ff12,#7dce00)] px-6 text-[22px] font-black text-[#050505] shadow-[0_16px_46px_rgba(163,255,18,0.30),inset_0_1px_0_rgba(255,255,255,0.28)] transition active:scale-[0.98]"
                onClick={handleReviewSale}
              >
                <span>Review Sale</span>
                <ArrowRight className="ml-auto h-8 w-8" />
              </button>

              <GlassCard className="mt-[22px] flex min-h-24 items-center justify-between gap-4 rounded-[16px] p-[18px]">
                <div className="flex min-w-0 items-center gap-4">
                  <span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full border border-[rgba(163,255,18,0.22)] bg-[rgba(163,255,18,0.08)] text-[#a3ff12]">
                    <CreditCard className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white/40">Default Payment</p>
                    <p className="mt-1 truncate text-lg font-semibold text-white/75">Selected during review</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-2 text-base font-extrabold text-[#a3ff12]"
                  onClick={() => openDetailSection("appointments")}
                >
                  Change
                  <ArrowRight className="h-5 w-5" />
                </button>
              </GlassCard>
            </div>
          ) : null}

          {activePanel === "appointments" ? (
            <section className="mt-7 grid gap-4 xl:grid-cols-2">
              <GlassCard className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="bvr-section-label">Appointment checkout</p>
                    <h3 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Ready to close</h3>
                  </div>
                  <CircleDollarSign className="h-5 w-5 text-[#a3ff12]" />
                </div>
                <div className="mt-4 space-y-3">
                  {readyForCheckout.length ? readyForCheckout.slice(0, 4).map((appointment) => (
                    <div key={`panel-ready-${appointment.id}`} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{appointment.display.clientName}</p>
                          <p className="mt-2 text-sm text-white/58">{appointment.display.serviceName}</p>
                          <p className="mt-2 text-sm text-white/48">{formatDateTime(appointment.start)}</p>
                        </div>
                        <StatusBadge>{currency(appointment.financial.outstandingBalance)} due</StatusBadge>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/58">
                      No unpaid completed tickets are waiting right now.
                    </div>
                  )}
                </div>
              </GlassCard>

              <GlassCard className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="bvr-section-label">Receipts</p>
                    <h3 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Paid today</h3>
                  </div>
                  <ReceiptText className="h-5 w-5 text-[#a3ff12]" />
                </div>
                <div className="mt-4 space-y-3">
                  {paidAppointments.length ? paidAppointments.slice(0, 4).map((appointment) => (
                    <div key={`panel-paid-${appointment.id}`} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{appointment.display.clientName}</p>
                          <p className="mt-2 text-sm text-white/58">{appointment.display.serviceName}</p>
                          <p className="mt-2 text-sm text-white/48">Tip {currency(appointment.financial.tipAmount)}</p>
                        </div>
                        <StatusBadge tone="neutral">{currency(appointment.financial.capturedAmount || appointment.totalAmount)}</StatusBadge>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/58">
                      Paid tickets will appear here once checkout closes them.
                    </div>
                  )}
                </div>
              </GlassCard>
            </section>
          ) : null}

          {activePanel === "services" ? (
            <section className="mt-7 grid gap-4 xl:grid-cols-[0.96fr_1.04fr]">
              <GlassCard className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="bvr-section-label">Service library</p>
                    <h3 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Load a real price</h3>
                  </div>
                  <Scissors className="h-5 w-5 text-[#a3ff12]" />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {serviceShortcuts.length ? serviceShortcuts.map((item) => (
                    <button
                      key={item.service.id}
                      type="button"
                      onClick={() => handleLoadService(item.service)}
                      className="rounded-[22px] border border-white/8 bg-black/20 p-4 text-left transition hover:border-[#a3ff12]/24 hover:bg-black/30"
                    >
                      <p className="font-semibold text-white">{item.service.name}</p>
                      <p className="mt-2 text-sm text-white/58">{currency(item.service.price)} | {item.service.durationMin} min</p>
                      <p className="mt-2 text-sm text-white/48">{item.ownerLabel}</p>
                    </button>
                  )) : (
                    <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/58 sm:col-span-2">
                      Real services appear here once the service library has active pricing.
                    </div>
                  )}
                </div>
              </GlassCard>

              <GlassCard className="p-5">
                <p className="bvr-section-label">Loaded sale</p>
                <p className="mt-4 text-5xl font-black tracking-[-0.06em] text-[#a3ff12]">{currency(keypadAmount)}</p>
                <p className="mt-3 text-sm text-white/58">
                  {selectedServiceLabel ? `${selectedServiceLabel} is ready in Keypad.` : "Choose a service to load its live price into Keypad."}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <ActionButton type="button" onClick={() => setActivePanel("keypad")}>
                    Back to Keypad
                  </ActionButton>
                  <ActionButton type="button" variant="secondary" onClick={() => openDetailSection("services")}>
                    Open full service library
                  </ActionButton>
                </div>
              </GlassCard>
            </section>
          ) : null}
        </div>
      </GlassCard>

      <section id="barber-checkout-appointments" className="grid scroll-mt-6 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <GlassCard className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="bvr-section-label">Appointment payments</p>
              <h3 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Completed tickets</h3>
              <p className="mt-2 text-sm text-white/58">Real appointment balances only.</p>
            </div>
            <CircleDollarSign className="h-5 w-5 text-[#a3ff12]" />
          </div>

          <div className="mt-4 space-y-3">
            {readyForCheckout.length ? readyForCheckout.map((appointment) => (
              <div key={appointment.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-white">{appointment.display.clientName}</p>
                    <p className="mt-2 text-sm text-white/58">{appointment.display.serviceName} | {formatDateTime(appointment.start)}</p>
                    <p className="mt-2 text-sm text-white/52">{appointment.display.locationLabel}</p>
                  </div>
                  <div className="rounded-[18px] border border-white/8 bg-black/24 px-4 py-3 text-right">
                    <p className="surface-label">Balance due</p>
                    <p className="mt-2 text-lg font-semibold text-white">{currency(appointment.financial.outstandingBalance)}</p>
                    <p className="mt-1 text-sm text-white/52">{appointment.financial.latestStatusLabel}</p>
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/58">
                No completed tickets are waiting on checkout right now.
              </div>
            )}
          </div>
        </GlassCard>

        <GlassCard className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="bvr-section-label">Money posture</p>
              <h3 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Today at a glance</h3>
              <p className="mt-2 text-sm text-white/58">Fast payment context without a second source of truth.</p>
            </div>
            <WalletCards className="h-5 w-5 text-[#a3ff12]" />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Ready now</p>
              <p className="mt-3 text-2xl font-semibold text-white">{readyForCheckout.length}</p>
              <p className="mt-2 text-sm text-white/58">Waiting closeout.</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Paid today</p>
              <p className="mt-3 text-2xl font-semibold text-white">{paidAppointments.length}</p>
              <p className="mt-2 text-sm text-white/58">Captured or tipped.</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Gross today</p>
              <p className="mt-3 text-2xl font-semibold text-white">{currency(payload?.earnings.grossSales ?? 0)}</p>
              <p className="mt-2 text-sm text-white/58">Posted earnings.</p>
            </div>
          </div>
        </GlassCard>
      </section>

      <GlassCard className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="bvr-section-label">Paid appointments</p>
            <h3 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Receipts, tips, and closed tickets</h3>
            <p className="mt-2 text-sm text-white/58">Receipts stay connected to the appointment record.</p>
          </div>
          <ReceiptText className="h-5 w-5 text-[#a3ff12]" />
        </div>

        <div className="mt-4 space-y-3">
          {paidAppointments.length ? paidAppointments.map((appointment) => (
            <div key={`paid-${appointment.id}`} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-white">{appointment.display.clientName}</p>
                  <p className="mt-2 text-sm text-white/58">{appointment.display.serviceName} | {formatDateTime(appointment.start)}</p>
                  <p className="mt-2 text-sm text-white/52">{appointment.financial.latestStatusLabel} | Tip {currency(appointment.financial.tipAmount)}</p>
                </div>
                <div className="rounded-[18px] border border-white/8 bg-black/24 px-4 py-3 text-right">
                  <p className="surface-label">Collected</p>
                  <p className="mt-2 text-lg font-semibold text-white">{currency(appointment.financial.capturedAmount || appointment.totalAmount)}</p>
                  <p className="mt-1 text-sm text-white/52">{formatStatusLabel(appointment.status)}</p>
                </div>
              </div>
            </div>
          )) : (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/58">
              Paid tickets will appear here once the live checkout rail closes them.
            </div>
          )}
        </div>
      </GlassCard>

      <div id="barber-checkout-earnings" className="scroll-mt-6">
        <BarberEarningsWorkspace barberName={barberName} />
      </div>

      <div id="barber-checkout-services" className="scroll-mt-6">
        <ServiceCatalogWorkspace role={barberRole} />
      </div>
    </div>
  );
}
