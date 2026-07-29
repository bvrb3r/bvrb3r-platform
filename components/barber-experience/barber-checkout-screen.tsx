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
  Scissors
} from "lucide-react";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { ActionButton, GlassCard, StatusBadge } from "@/design/components";
import { useMarketplaceServiceCatalog } from "@/lib/marketplace/client";
import { useBarberOverviewQuery } from "@/lib/operations/barber-client";
import { cn } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";

const sectionIdMap = {
  appointments: "barber-checkout-appointments",
  services: "barber-checkout-services"
} as const;

const checkoutPanels = [
  { key: "appointments", label: "Appointments", helper: "Close tickets" },
  { key: "keypad", label: "Keypad", helper: "Custom sale" },
  { key: "services", label: "Library", helper: "Load pricing" }
] as const;

const quickAmounts = [25, 35, 40] as const;
const checkoutCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
type PosPaymentMethodKey = "cash" | "card_on_file";
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
type PosSaleQuote = {
  subtotalCents: number;
  platformFeeCents: number;
  clientFeeCents: number;
  discountCents: number;
  tipCents: number;
  totalCents: number;
  barberPayoutCents: number;
  shopSplitCents: number;
  relationshipType: string;
};
type PosClientCandidate = {
  clientId: string;
  clientName: string;
  email?: string | null;
  phone?: string | null;
};

function normalizeCheckoutSection(section?: string): CheckoutSectionKey | null {
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
  return Number(digits || "0");
}

function amountToDigits(amount: number) {
  return String(Math.round(amount));
}

function formatCheckoutAmount(amount: number) {
  return checkoutCurrencyFormatter.format(amount);
}

function formatCheckoutCents(amountCents: number) {
  return checkoutCurrencyFormatter.format(amountCents / 100);
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

export function BarberCheckoutScreen({
  initialSection,
  appointmentId
}: {
  barberName: string;
  initialSection?: string;
  appointmentId?: string;
}) {
  const overviewQuery = useBarberOverviewQuery();
  const serviceCatalogQuery = useMarketplaceServiceCatalog();
  const payload = overviewQuery.data;
  const todayAppointments = payload?.todayAppointments ?? [];
  const upcomingAppointments = payload?.upcomingAppointments ?? [];
  const quickClients = useMemo(() => payload?.quickClients ?? [], [payload?.quickClients]);
  const readyForCheckout = todayAppointments.filter((appointment) => appointment.status === "completed" && appointment.financial.outstandingBalance > 0);
  const targetedAppointment = [...todayAppointments, ...upcomingAppointments]
    .find((appointment) => appointment.id === appointmentId) ?? null;
  const selectedSection = normalizeCheckoutSection(initialSection);
  const [activePanel, setActivePanel] = useState<CheckoutPanelKey>(() => normalizeCheckoutPanel(initialSection));
  const [chargeDigits, setChargeDigits] = useState("0");
  const [selectedServiceLabel, setSelectedServiceLabel] = useState<string | null>(null);
  const [panelFeedback, setPanelFeedback] = useState<{ tone: "info" | "error"; message: string } | null>(null);
  const [saleNote, setSaleNote] = useState("");
  const [reviewQuote, setReviewQuote] = useState<PosSaleQuote | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [paymentMethodOpen, setPaymentMethodOpen] = useState(false);
  const [paymentMethodLoading, setPaymentMethodLoading] = useState<PosPaymentMethodKey | null>(null);
  const [paymentFeedback, setPaymentFeedback] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [clientSearchResults, setClientSearchResults] = useState<PosClientCandidate[]>([]);
  const [clientSearchLoading, setClientSearchLoading] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [cashCustomerName, setCashCustomerName] = useState("");
  const [cashCustomerPhone, setCashCustomerPhone] = useState("");
  const [cashCustomerEmail, setCashCustomerEmail] = useState("");
  const [pendingRequestRetry, setPendingRequestRetry] = useState<{ saleId: string } | null>(null);
  const [targetedChargeReviewOpen, setTargetedChargeReviewOpen] = useState(false);
  const [targetedChargeLoading, setTargetedChargeLoading] = useState(false);
  const [targetedChargeFeedback, setTargetedChargeFeedback] = useState<string | null>(null);
  const keypadAmount = digitsToAmount(chargeDigits);
  const serviceShortcuts = useMemo(
    () => [...(serviceCatalogQuery.data?.editableServices ?? []), ...(serviceCatalogQuery.data?.readOnlyServices ?? [])]
      .filter((item) => item.service.isActive !== false)
      .slice(0, 8),
    [serviceCatalogQuery.data]
  );
  const searchableClients = useMemo(() => {
    const byId = new Map<string, PosClientCandidate>();
    [...clientSearchResults, ...quickClients].forEach((client) => {
      byId.set(client.clientId, client);
    });
    return Array.from(byId.values());
  }, [clientSearchResults, quickClients]);
  const selectedClient = searchableClients.find((client) => client.clientId === selectedClientId) ?? null;

  useEffect(() => {
    setActivePanel(normalizeCheckoutPanel(initialSection));
  }, [initialSection]);

  useEffect(() => {
    if (appointmentId) {
      setActivePanel("appointments");
    }
  }, [appointmentId]);

  useEffect(() => {
    const query = clientSearch.trim().toLowerCase();
    if (query.length < 2) {
      setClientSearchResults([]);
      setClientSearchLoading(false);
      if (!query) {
        setSelectedClientId(null);
      }
      return;
    }

    let cancelled = false;
    const filterClients = (clients: PosClientCandidate[]) => clients.filter((client) =>
      [
        client.clientName,
        client.email,
        client.phone
      ].some((value) => value?.toLowerCase().includes(query))
    ).slice(0, 6);

    setClientSearchLoading(true);
    fetch(`/api/barber/clients?query=${encodeURIComponent(query)}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("client_search_failed")))
      .then((body) => {
        if (cancelled) return;
        const clients = Array.isArray(body?.clients) ? body.clients as PosClientCandidate[] : quickClients;
        setClientSearchResults(filterClients(clients));
      })
      .catch(() => {
        if (cancelled) return;
        setClientSearchResults(filterClients(quickClients));
      })
      .finally(() => {
        if (!cancelled) {
          setClientSearchLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clientSearch, quickClients]);

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
    setSaleNote("");
    setPaymentFeedback(null);
    setClientSearch("");
    setClientSearchResults([]);
    setClientSearchLoading(false);
    setSelectedClientId(null);
    setCashCustomerName("");
    setCashCustomerPhone("");
    setCashCustomerEmail("");
    setPendingRequestRetry(null);
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

  async function readJsonResponse(response: Response) {
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok === false) {
      throw new Error(typeof body?.error === "string" ? body.error : "Unable to process this POS sale.");
    }
    return body;
  }

  async function handleReviewSale() {
    if (keypadAmount <= 0) {
      setPanelFeedback({ tone: "error", message: "Enter an amount or load a service before opening checkout." });
      return;
    }

    setReviewLoading(true);
    setPanelFeedback(null);
    try {
      const amountCents = Math.round(keypadAmount * 100);
      const response = await fetch("/api/barber/pos-sales/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents,
          note: saleNote,
          items: [{
            itemType: selectedServiceLabel ? "service" : "custom_amount",
            name: selectedServiceLabel ?? "Custom Amount",
            quantity: 1,
            unitAmountCents: amountCents
          }]
        })
      });
      const body = await readJsonResponse(response);
      setReviewQuote(body.quote as PosSaleQuote);
      setReviewOpen(true);
    } catch (error) {
      setPanelFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to review this POS sale."
      });
    } finally {
      setReviewLoading(false);
    }
  }

  function handleChoosePaymentMethod() {
    if (!reviewQuote) {
      return;
    }

    setReviewOpen(false);
    setPaymentMethodOpen(true);
    setPaymentFeedback(null);
  }

  function buildPosSalePayload(paymentMethod: PosPaymentMethodKey, extra?: {
    clientId?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    customerEmail?: string | null;
  }) {
    const amountCents = Math.round(keypadAmount * 100);
    return {
      amountCents,
      subtotalCents: amountCents,
      discountCents: reviewQuote?.discountCents ?? 0,
      tipCents: reviewQuote?.tipCents ?? 0,
      note: saleNote,
      paymentMethod,
      clientId: extra?.clientId ?? null,
      customerName: extra?.customerName ?? null,
      customerPhone: extra?.customerPhone ?? null,
      customerEmail: extra?.customerEmail ?? null,
      items: [{
        itemType: selectedServiceLabel ? "service" : "custom_amount",
        name: selectedServiceLabel ?? "Custom Amount",
        quantity: 1,
        unitAmountCents: amountCents
      }]
    };
  }

  async function createPendingSale(paymentMethod: PosPaymentMethodKey, extra?: {
    clientId?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    customerEmail?: string | null;
  }) {
    const saleResponse = await fetch("/api/barber/pos-sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPosSalePayload(paymentMethod, extra))
    });
    const saleBody = await readJsonResponse(saleResponse);
    const saleId = saleBody?.sale?.id;
    if (!saleId) {
      throw new Error("POS sale was created without a sale id.");
    }

    return saleId as string;
  }

  async function handlePaymentMethod(method: PosPaymentMethodKey) {
    if (!reviewQuote || paymentMethodLoading) {
      return;
    }

    if (method === "card_on_file" && !selectedClient) {
      setPaymentFeedback("Select a client before sending payment request.");
      return;
    }

    setPaymentMethodLoading(method);
    setPaymentFeedback(null);
    setPanelFeedback(null);
    try {
      if (method === "cash") {
        const cashResponse = await fetch("/api/barber/pos-sales/cash", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPosSalePayload("cash", {
            customerName: cashCustomerName.trim() || null,
            customerPhone: cashCustomerPhone.trim() || null,
            customerEmail: cashCustomerEmail.trim() || null
          }))
        });
        await readJsonResponse(cashResponse);
        setPaymentMethodOpen(false);
        setReviewQuote(null);
        setPendingRequestRetry(null);
        clearQuickCharge();
        setPanelFeedback({ tone: "info", message: "Cash sale recorded. No platform payout created." });
        await overviewQuery.refetch();
        return;
      }

      const saleId = await createPendingSale(method, {
        clientId: selectedClient?.clientId,
        customerName: selectedClient?.clientName
      });
      const requestResponse = await fetch(`/api/barber/pos-sales/${saleId}/payment-request`, {
        method: "POST",
      });
      const requestBody = await readJsonResponse(requestResponse);
      const paymentCardDeliveryFailed = requestBody?.paymentCardDelivered === false
        || (requestBody?.paymentCardDelivered !== true && requestBody?.messageDeliveryStatus === "failed");
      if (paymentCardDeliveryFailed) {
        setPendingRequestRetry({ saleId: requestBody?.sale?.id ?? saleId });
        setPaymentFeedback(requestBody?.message ?? "Request created, but message delivery failed. Retry sending message.");
        await overviewQuery.refetch();
        return;
      }
      setPendingRequestRetry(null);
      setPaymentMethodOpen(false);
      setReviewQuote(null);
      clearQuickCharge();
      setPanelFeedback({
        tone: "info",
        message: "Payment request sent. Client approval is required before payout."
      });
      await overviewQuery.refetch();
    } catch (error) {
      setPaymentFeedback(error instanceof Error ? error.message : "Unable to process this payment method.");
    } finally {
      setPaymentMethodLoading(null);
    }
  }

  async function handleRetryPaymentRequestMessage() {
    if (!pendingRequestRetry || paymentMethodLoading) {
      return;
    }

    setPaymentMethodLoading("card_on_file");
    setPaymentFeedback(null);
    try {
      const retryResponse = await fetch(`/api/barber/pos-sales/${pendingRequestRetry.saleId}/payment-request/retry-message`, {
        method: "POST"
      });
      const retryBody = await readJsonResponse(retryResponse);
      const paymentCardDeliveryFailed = retryBody?.paymentCardDelivered === false
        || (retryBody?.paymentCardDelivered !== true && retryBody?.messageDeliveryStatus === "failed");
      if (paymentCardDeliveryFailed) {
        throw new Error(retryBody?.message ?? "Request exists, but message delivery is still failing.");
      }

      setPendingRequestRetry(null);
      setPaymentMethodOpen(false);
      setReviewQuote(null);
      clearQuickCharge();
      setPanelFeedback({
        tone: "info",
        message: retryBody?.message ?? "Payment request sent. Client approval is required before payout."
      });
      await overviewQuery.refetch();
    } catch (error) {
      setPaymentFeedback(error instanceof Error ? error.message : "Unable to retry this payment request message.");
    } finally {
      setPaymentMethodLoading(null);
    }
  }

  function handleLoadService(service: (typeof serviceShortcuts)[number]["service"]) {
    setChargeDigits(amountToDigits(Number(service.price)));
    setSelectedServiceLabel(service.name);
    setPanelFeedback({
      tone: "info",
      message: `${service.name} loaded into Keypad.`
    });
    setActivePanel("keypad");
  }

  function handleNoteAction() {
    setPanelFeedback({ tone: "info", message: "Add an optional note before Review Sale." });
  }

  function handleSecondaryMoneyAction(label: string) {
    setPanelFeedback({
      tone: "info",
      message: `${label} opens during payment review.`
    });
  }

  function handleTapToPayUnavailable() {
    setPaymentFeedback("Tap to Pay is not connected yet. Use Cash or Card on File.");
  }

  async function handleTargetedAppointmentCharge() {
    if (!targetedAppointment || targetedChargeLoading) {
      return;
    }

    setTargetedChargeLoading(true);
    setTargetedChargeFeedback(null);
    try {
      const response = await fetch(`/api/payments/appointments/${encodeURIComponent(targetedAppointment.id)}/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "stripe" })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof body?.error === "string" ? body.error : "Unable to charge this appointment.");
      }

      setTargetedChargeReviewOpen(false);
      setTargetedChargeFeedback("Appointment payment captured. Refreshing the command center balance.");
      await overviewQuery.refetch();
    } catch (error) {
      setTargetedChargeFeedback(error instanceof Error ? error.message : "Unable to charge this appointment.");
    } finally {
      setTargetedChargeLoading(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="barber-checkout-screen">
      {panelFeedback ? <FeedbackBanner tone={panelFeedback.tone} message={panelFeedback.message} /> : null}
      {overviewQuery.error ? <FeedbackBanner tone="error" message={getReadableActionError(overviewQuery.error)} /> : null}

      {appointmentId ? (
        <GlassCard className="rounded-[28px] border-[#c4f24e]/24 p-5 sm:p-6" data-testid="targeted-appointment-checkout">
          {targetedAppointment ? (
            <div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="bvr-section-label">BVRB3R appointment checkout</p>
                  <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">
                    {targetedAppointment.display.clientName}
                  </h2>
                  <p className="mt-2 text-sm text-white/60">
                    {targetedAppointment.display.serviceName} · {formatDateTime(targetedAppointment.start)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge>BVRB3R</StatusBadge>
                    <StatusBadge>{targetedAppointment.display.statusLabel}</StatusBadge>
                    <StatusBadge>{formatCheckoutAmount(targetedAppointment.financial.outstandingBalance)} due</StatusBadge>
                  </div>
                </div>
                <CreditCard className="h-6 w-6 text-[#c4f24e]" />
              </div>

              {targetedChargeFeedback ? (
                <div className="mt-4">
                  <FeedbackBanner
                    tone={targetedChargeFeedback.startsWith("Appointment payment captured") ? "info" : "error"}
                    message={targetedChargeFeedback}
                  />
                </div>
              ) : null}

              {targetedAppointment.financial.outstandingBalance <= 0 ? (
                <div className="mt-5 rounded-[18px] border border-emerald-300/16 bg-emerald-300/[0.06] px-4 py-3 text-sm text-emerald-100">
                  This BVRB3R appointment is settled. Return to the command center to complete the service.
                </div>
              ) : targetedChargeReviewOpen ? (
                <div className="mt-5 rounded-[20px] border border-[#c4f24e]/20 bg-[#c4f24e]/[0.05] p-4">
                  <p className="font-extrabold text-white">Confirm card-on-file charge</p>
                  <p className="mt-2 text-sm leading-6 text-white/60">
                    Charge {formatCheckoutAmount(targetedAppointment.financial.outstandingBalance)} to this client&apos;s default saved Stripe card. The server rechecks appointment ownership, source and balance before capture.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ActionButton
                      type="button"
                      variant="secondary"
                      disabled={targetedChargeLoading}
                      onClick={() => setTargetedChargeReviewOpen(false)}
                    >
                      Cancel
                    </ActionButton>
                    <ActionButton
                      type="button"
                      disabled={targetedChargeLoading}
                      onClick={() => void handleTargetedAppointmentCharge()}
                    >
                      {targetedChargeLoading
                        ? "Charging..."
                        : `Charge ${formatCheckoutAmount(targetedAppointment.financial.outstandingBalance)}`}
                    </ActionButton>
                  </div>
                </div>
              ) : (
                <div className="mt-5 flex flex-wrap gap-3">
                  <ActionButton type="button" onClick={() => setTargetedChargeReviewOpen(true)}>
                    Review appointment charge
                  </ActionButton>
                  <ActionButton type="button" variant="secondary" onClick={() => setActivePanel("keypad")}>
                    Open standalone POS
                  </ActionButton>
                </div>
              )}
            </div>
          ) : overviewQuery.isLoading ? (
            <p className="text-sm text-white/58">Loading the appointment checkout…</p>
          ) : (
            <FeedbackBanner
              tone="error"
              message="This appointment is not available in your BVRB3R chair schedule. External source appointments cannot enter BVRB3R checkout."
            />
          )}
        </GlassCard>
      ) : null}

      <GlassCard className="relative overflow-hidden rounded-[28px] p-5 sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(196, 242, 78,0.10),transparent_30%),radial-gradient(circle_at_bottom_center,rgba(196, 242, 78,0.06),transparent_28%)]" />
        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="bvr-section-label">Money terminal</p>
              <h2 className="mt-3 text-[2.65rem] font-black leading-none tracking-[-0.045em] text-white sm:text-6xl">
                Checkout
              </h2>
              <p className="mt-2 max-w-xl text-base font-medium text-white/60 sm:text-[17px]">
                Appointments, custom walk-ins, and real service prices stay in one premium POS lane.
              </p>
            </div>
            <button
              type="button"
              aria-label="Open recent checkout history"
              className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white transition hover:border-[#c4f24e]/35 hover:shadow-[0_0_24px_rgba(196, 242, 78,0.12)]"
              onClick={() => openDetailSection("appointments")}
            >
              <History className="h-6 w-6" />
            </button>
          </div>

          <div className="mt-[30px] grid min-h-[76px] grid-cols-3 rounded-[14px] border border-white/10 bg-white/[0.025] p-1.5">
            {checkoutPanels.map((panel) => (
              <button
                key={panel.key}
                type="button"
                className={cn(
                  "flex flex-col items-center justify-center rounded-[10px] px-1 text-center text-sm font-extrabold transition sm:text-base",
                  activePanel === panel.key
                    ? "bg-[linear-gradient(135deg,#c4f24e,#8fbf2e)] text-[#050505] shadow-[0_0_28px_rgba(196, 242, 78,0.25)]"
                    : "text-white/70 hover:text-white"
                )}
                onClick={() => setActivePanel(panel.key)}
              >
                <span>{panel.label}</span>
                <span className={cn("mt-1 hidden text-[10px] font-black uppercase tracking-[0.12em] sm:block", activePanel === panel.key ? "text-black/58" : "text-white/34")}>
                  {panel.helper}
                </span>
              </button>
            ))}
          </div>

          {activePanel === "keypad" ? (
            <div>
              <section className="mt-[38px]">
                <p className="text-sm font-black uppercase tracking-[0.18em] text-white/40">Total amount</p>
                <p className="mt-2 text-[4.25rem] font-black leading-[0.95] tracking-[-0.07em] text-[#c4f24e] [text-shadow:0_0_34px_rgba(196, 242, 78,0.24)] sm:text-[6rem]">
                  {formatCheckoutAmount(keypadAmount)}
                </p>
                {selectedServiceLabel ? <p className="mt-3 text-sm font-semibold text-white/60">{selectedServiceLabel} loaded into the sale.</p> : null}
                <label className="mt-5 block">
                  <span className="text-xs font-black uppercase tracking-[0.28em] text-white/34">Sale note</span>
                  <input
                    value={saleNote}
                    onChange={(event) => setSaleNote(event.target.value)}
                    placeholder="Optional customer or sale note"
                    className="mt-2 h-12 w-full rounded-[8px] border border-white/10 bg-black/28 px-4 text-sm font-semibold text-white outline-none transition placeholder:text-white/30 focus:border-[#c4f24e]/45"
                  />
                </label>
              </section>

              <section className="mt-7 grid grid-cols-4 gap-2 sm:gap-3">
                <button
                  type="button"
                  className="flex h-[72px] items-center justify-center gap-2 rounded-[8px] border border-white/10 bg-white/[0.035] text-base font-extrabold text-white transition hover:border-[#c4f24e]/25 hover:bg-[#c4f24e]/[0.04] sm:h-[88px] sm:gap-3 sm:text-xl"
                  onClick={handleNoteAction}
                >
                  <Plus className="h-7 w-7 text-[#c4f24e] sm:h-8 sm:w-8" />
                  Note
                </button>
                {quickAmounts.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    className="h-[72px] rounded-[8px] border border-white/10 bg-white/[0.035] text-base font-extrabold text-white transition hover:border-[#c4f24e]/25 hover:bg-[#c4f24e]/[0.04] sm:h-[88px] sm:text-2xl"
                    onClick={() => handleQuickAmount(amount)}
                  >
                    {formatCheckoutAmount(amount)}
                  </button>
                ))}
              </section>

              <section className="mt-7 overflow-hidden rounded-[16px] border-[1.5px] border-[#c4f24e]/52 bg-white/[0.018] shadow-[0_0_32px_rgba(196, 242, 78,0.14),inset_0_1px_0_rgba(255,255,255,0.045)]">
                <div className="grid grid-cols-3">
                  {keypadButtons.map((button, index) => (
                    <button
                      key={button.key}
                      type="button"
                      className={cn(
                        "flex h-[104px] flex-col items-center justify-center border-[rgba(196, 242, 78,0.14)] transition hover:bg-[#c4f24e]/[0.06] sm:h-[132px]",
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
                          "text-[34px] font-black leading-none tracking-[-0.03em] sm:text-[42px]",
                          button.key === "clear" ? "text-[#ff2d2d]" : button.key === "plus" ? "text-[#c4f24e]" : "text-white"
                        )}
                      >
                        {button.label}
                      </span>
                      {"sublabel" in button ? <span className="mt-2 text-[11px] font-semibold tracking-[0.22em] text-white/40 sm:text-sm">{button.sublabel}</span> : null}
                    </button>
                  ))}
                </div>
              </section>

              <section className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  className="flex min-h-[92px] items-center gap-4 rounded-[12px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-4 text-left shadow-[0_14px_42px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-[#c4f24e]/25 sm:min-h-[112px]"
                  onClick={() => handleSecondaryMoneyAction("Discount")}
                >
                  <span className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full border border-[#c4f24e]/65 bg-[rgba(196, 242, 78,0.08)] text-[#c4f24e] shadow-[0_0_22px_rgba(196, 242, 78,0.18)]">
                    <BadgePercent className="h-6 w-6" />
                  </span>
                  <span>
                    <span className="block text-xl font-black text-white">Apply Discount</span>
                    <span className="mt-1 block text-[15px] font-medium text-white/60">Add or apply discount</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="flex min-h-[92px] items-center gap-4 rounded-[12px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-4 text-left shadow-[0_14px_42px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-[#c4f24e]/25 sm:min-h-[112px]"
                  onClick={() => handleSecondaryMoneyAction("Tip")}
                >
                  <span className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full border border-[#c4f24e]/65 bg-[rgba(196, 242, 78,0.08)] text-[#c4f24e] shadow-[0_0_22px_rgba(196, 242, 78,0.18)]">
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
                disabled={reviewLoading}
                className="mt-[22px] flex min-h-[76px] w-full items-center justify-center rounded-[8px] bg-[linear-gradient(135deg,#c4f24e,#8fbf2e)] px-6 text-[21px] font-black text-[#050505] shadow-[0_16px_46px_rgba(196, 242, 78,0.28),inset_0_1px_0_rgba(255,255,255,0.28)] transition active:scale-[0.98] disabled:cursor-wait disabled:opacity-70 sm:min-h-[86px]"
                onClick={handleReviewSale}
              >
                <span>{reviewLoading ? "Building Quote..." : "Review Sale"}</span>
                <ArrowRight className="ml-auto h-8 w-8" />
              </button>

              <GlassCard className="mt-[22px] flex min-h-24 items-center justify-between gap-4 rounded-[16px] p-[18px]">
                <div className="flex min-w-0 items-center gap-4">
                  <span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full border border-[rgba(196, 242, 78,0.22)] bg-[rgba(196, 242, 78,0.08)] text-[#c4f24e]">
                    <CreditCard className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white/40">Default Payment</p>
                    <p className="mt-1 truncate text-lg font-semibold text-white/75">Selected during review</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-2 text-base font-extrabold text-[#c4f24e]"
                  onClick={() => openDetailSection("appointments")}
                >
                  Change
                  <ArrowRight className="h-5 w-5" />
                </button>
              </GlassCard>
            </div>
          ) : null}

          {activePanel === "appointments" ? (
            <section id="barber-checkout-appointments" className="mt-7 scroll-mt-6">
              <GlassCard className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="bvr-section-label">Appointment checkout</p>
                    <h3 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Ready to close</h3>
                  </div>
                  <CircleDollarSign className="h-5 w-5 text-[#c4f24e]" />
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
                        <StatusBadge>{formatCheckoutAmount(appointment.financial.outstandingBalance)} due</StatusBadge>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/58">
                      No unpaid completed tickets are waiting right now.
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
                  <Scissors className="h-5 w-5 text-[#c4f24e]" />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {serviceShortcuts.length ? serviceShortcuts.map((item) => (
                    <button
                      key={item.service.id}
                      type="button"
                      onClick={() => handleLoadService(item.service)}
                      className="rounded-[22px] border border-white/8 bg-black/20 p-4 text-left transition hover:border-[#c4f24e]/24 hover:bg-black/30"
                    >
                      <p className="font-semibold text-white">{item.service.name}</p>
                      <p className="mt-2 text-sm text-white/58">{formatCheckoutAmount(item.service.price)} | {item.service.durationMin} min</p>
                      <p className="mt-2 text-sm text-white/48">{item.ownerLabel}</p>
                    </button>
                  )) : (
                    <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/58 sm:col-span-2">
                      Real services appear here once the service library has active pricing.
                    </div>
                  )}
                </div>
              </GlassCard>

              <GlassCard id="barber-checkout-services" className="scroll-mt-6 p-5">
                <p className="bvr-section-label">Loaded sale</p>
                <p className="mt-4 text-5xl font-black tracking-[-0.06em] text-[#c4f24e]">{formatCheckoutAmount(keypadAmount)}</p>
                <p className="mt-3 text-sm text-white/58">
                  {selectedServiceLabel ? `${selectedServiceLabel} is ready in Keypad.` : "Choose a service to load its live price into Keypad."}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <ActionButton type="button" onClick={() => setActivePanel("keypad")}>
                    Back to Keypad
                  </ActionButton>
                </div>
              </GlassCard>
            </section>
          ) : null}
        </div>
      </GlassCard>
      {reviewOpen && reviewQuote ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/72 px-4 pb-4 backdrop-blur-md sm:items-center sm:pb-0" role="dialog" aria-modal="true" aria-label="Review POS sale">
          <div className="w-full max-w-[520px] rounded-[18px] border border-white/10 bg-[#080808] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="bvr-section-label">Review sale</p>
                <h3 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white">{selectedServiceLabel ?? "Custom Amount"}</h3>
                {saleNote.trim() ? <p className="mt-2 text-sm font-medium text-white/55">{saleNote.trim()}</p> : null}
              </div>
              <button
                type="button"
                className="rounded-[8px] border border-white/10 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-white/60 transition hover:text-white"
                onClick={() => setReviewOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-3 rounded-[14px] border border-white/10 bg-white/[0.035] p-4">
              <div className="flex justify-between gap-4 text-sm font-semibold text-white/62">
                <span>Subtotal</span>
                <span>{formatCheckoutCents(reviewQuote.subtotalCents)}</span>
              </div>
              <div className="flex justify-between gap-4 text-sm font-semibold text-white/62">
                <span>Platform fee</span>
                <span>{formatCheckoutCents(reviewQuote.platformFeeCents)}</span>
              </div>
              <div className="flex justify-between gap-4 text-sm font-semibold text-white/62">
                <span>Server quote barber payout</span>
                <span>{formatCheckoutCents(reviewQuote.barberPayoutCents)}</span>
              </div>
              {reviewQuote.shopSplitCents > 0 ? (
                <div className="flex justify-between gap-4 text-sm font-semibold text-white/62">
                  <span>Shop split</span>
                  <span>{formatCheckoutCents(reviewQuote.shopSplitCents)}</span>
                </div>
              ) : null}
              <div className="border-t border-white/10 pt-3">
                <div className="flex justify-between gap-4 text-lg font-black text-white">
                  <span>Total charge</span>
                  <span className="text-[#c4f24e]">{formatCheckoutCents(reviewQuote.totalCents)}</span>
                </div>
                <p className="mt-2 text-xs font-semibold text-white/40">
                  {reviewQuote.relationshipType.replace("_", " ")} sale. Payout readiness is confirmed only after the server records successful payment and routing evidence.
                </p>
              </div>
            </div>

            <button
              type="button"
              className="mt-5 flex min-h-[58px] w-full items-center justify-center rounded-[10px] bg-[linear-gradient(135deg,#c4f24e,#8fbf2e)] px-5 text-lg font-black text-[#050505] transition active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
              onClick={handleChoosePaymentMethod}
            >
              {`Charge ${formatCheckoutCents(reviewQuote.totalCents)}`}
            </button>
          </div>
        </div>
      ) : null}
      {paymentMethodOpen && reviewQuote ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/72 px-4 pb-4 backdrop-blur-md sm:items-center sm:pb-0" role="dialog" aria-modal="true" aria-label="Choose payment method">
          <div className="w-full max-w-[560px] rounded-[18px] border border-white/10 bg-[#080808] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="bvr-section-label">Current sale</p>
                <h3 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white">Choose payment method</h3>
                <p className="mt-2 text-lg font-black text-[#c4f24e]">Sale amount: {formatCheckoutCents(reviewQuote.totalCents)}</p>
              </div>
              <button
                type="button"
                className="rounded-[8px] border border-white/10 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-white/60 transition hover:text-white"
                onClick={() => setPaymentMethodOpen(false)}
              >
                Back
              </button>
            </div>

            {paymentFeedback ? (
              <div className="mt-4 rounded-[10px] border border-[#ff2d2d]/35 bg-[#ff2d2d]/10 px-4 py-3 text-sm font-semibold text-[#ff9b9b]">
                <p>{paymentFeedback}</p>
                {pendingRequestRetry ? (
                  <button
                    type="button"
                    disabled={Boolean(paymentMethodLoading)}
                    className="mt-3 rounded-[8px] border border-[#c4f24e]/35 bg-[#c4f24e]/10 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#e4f9b8] transition hover:bg-[#c4f24e]/15 disabled:cursor-wait disabled:opacity-70"
                    onClick={handleRetryPaymentRequestMessage}
                  >
                    Retry sending message
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 grid gap-3">
              <button
                type="button"
                aria-disabled="true"
                className="rounded-[12px] border border-white/10 bg-white/[0.02] p-4 text-left opacity-70 transition hover:border-white/20"
                onClick={handleTapToPayUnavailable}
              >
                <span className="block text-lg font-black text-white">Tap to Pay</span>
                <span className="mt-1 block text-sm font-semibold text-white/55">Accept contactless card / Apple Pay / Google Pay.</span>
                <span className="mt-2 block text-xs font-semibold text-[#c4f24e]/75">Tap to Pay setup required.</span>
              </button>

              <div className="rounded-[12px] border border-white/10 bg-white/[0.035] p-4">
                <span className="block text-lg font-black text-white">Cash</span>
                <span className="mt-1 block text-sm font-semibold text-white/55">Record cash sale. No platform payout.</span>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <input
                    value={cashCustomerName}
                    onChange={(event) => setCashCustomerName(event.target.value)}
                    placeholder="Customer name (optional)"
                    className="h-10 rounded-[8px] border border-white/10 bg-black/35 px-3 text-xs font-semibold text-white outline-none placeholder:text-white/30 focus:border-[#c4f24e]/45"
                  />
                  <input
                    value={cashCustomerPhone}
                    onChange={(event) => setCashCustomerPhone(event.target.value)}
                    placeholder="Phone (optional)"
                    className="h-10 rounded-[8px] border border-white/10 bg-black/35 px-3 text-xs font-semibold text-white outline-none placeholder:text-white/30 focus:border-[#c4f24e]/45"
                  />
                  <input
                    value={cashCustomerEmail}
                    onChange={(event) => setCashCustomerEmail(event.target.value)}
                    placeholder="Email (optional)"
                    className="h-10 rounded-[8px] border border-white/10 bg-black/35 px-3 text-xs font-semibold text-white outline-none placeholder:text-white/30 focus:border-[#c4f24e]/45"
                  />
                </div>
                <button
                  type="button"
                  disabled={Boolean(paymentMethodLoading)}
                  className="mt-3 flex min-h-11 w-full items-center justify-center rounded-[8px] border border-[#c4f24e]/35 bg-[#c4f24e]/8 px-4 text-sm font-black text-[#c4f24e] transition hover:bg-[#c4f24e]/12 disabled:cursor-wait disabled:opacity-70"
                  onClick={() => handlePaymentMethod("cash")}
                >
                  Record cash
                </button>
              </div>

              <div className="rounded-[12px] border border-white/10 bg-white/[0.035] p-4">
                <div className="w-full text-left">
                  <span className="block text-lg font-black text-white">Card on File</span>
                  <span className="mt-1 block text-sm font-semibold text-white/55">Search a BVRB3R client and send an approval request.</span>
                </div>
                <input
                  value={clientSearch}
                  onChange={(event) => setClientSearch(event.target.value)}
                  placeholder="Search clients by name, phone, or email"
                  className="mt-3 h-11 w-full rounded-[8px] border border-white/10 bg-black/35 px-3 text-sm font-semibold text-white outline-none placeholder:text-white/30 focus:border-[#c4f24e]/45"
                />
                <div className="mt-3 grid gap-2">
                  {clientSearch.trim().length < 2 ? (
                    <p className="rounded-[8px] border border-dashed border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-white/45">Search for a BVRB3R client to request payment.</p>
                  ) : clientSearchLoading ? (
                    <p className="rounded-[8px] border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-white/55">Searching...</p>
                  ) : clientSearchResults.length ? clientSearchResults.map((client) => (
                    <button
                      key={client.clientId}
                      type="button"
                      className={cn(
                        "rounded-[8px] border px-3 py-2 text-left text-sm transition",
                        selectedClientId === client.clientId
                          ? "border-[#c4f24e]/55 bg-[#c4f24e]/10 text-white"
                          : "border-white/10 bg-black/20 text-white/70 hover:text-white"
                      )}
                      onClick={() => setSelectedClientId(client.clientId)}
                    >
                      <span className="block font-black">{client.clientName}</span>
                      <span className="mt-0.5 block text-xs text-white/45">{client.email || client.phone || "Client"}</span>
                      {selectedClientId === client.clientId ? <span className="mt-1 block text-xs font-semibold text-[#c4f24e]/75">Ready to request card approval.</span> : null}
                    </button>
                  )) : (
                    <p className="rounded-[8px] border border-dashed border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-white/45">No matching clients yet.</p>
                  )}
                </div>
                {selectedClient ? (
                  <div className="mt-3 rounded-[10px] border border-[#c4f24e]/35 bg-[#c4f24e]/10 px-3 py-2">
                    <p className="text-sm font-black text-white">{selectedClient.clientName}</p>
                    <p className="mt-1 text-xs font-semibold text-white/55">{selectedClient.email || selectedClient.phone || "Selected client"}</p>
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={Boolean(paymentMethodLoading)}
                  className="mt-3 flex min-h-11 w-full items-center justify-center rounded-[8px] border border-[#c4f24e]/45 bg-[#c4f24e]/10 px-4 text-sm font-black text-[#c4f24e] transition hover:bg-[#c4f24e]/15 disabled:cursor-wait disabled:opacity-70"
                  onClick={() => handlePaymentMethod("card_on_file")}
                >
                  Send payment request
                </button>
              </div>
            </div>

            {paymentMethodLoading ? <p className="mt-4 text-center text-sm font-black uppercase tracking-[0.22em] text-[#c4f24e]">Processing {paymentMethodLoading.replace("_", " ")}...</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
