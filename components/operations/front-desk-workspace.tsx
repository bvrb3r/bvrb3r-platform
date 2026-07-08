"use client";

import { useState } from "react";
import { Clock3, ReceiptText, Rows3, Users2 } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { KioskControlPanel } from "@/components/operations/kiosk-control-panel";
import { ShopManagerPanel } from "@/components/operations/shop-manager-panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueueOperationsQuery } from "@/lib/operations/queue-client";
import { useAppointmentTransitionMutation, useCheckoutAppointmentMutation, useLiveOperationsSnapshot, type OperationsApiError } from "@/lib/operations/live-client";
import { useOperationsStore } from "@/lib/store/operations-store";
import { getReadableActionError } from "@/lib/utils/feedback";
import { currency, dateLabel } from "@/lib/utils";
import { getAppointmentViewModel, isAppointmentPaid, isReadyForCheckout } from "@/lib/utils/operations";

function MetricSkeleton() {
  return (
    <div className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-4 h-9 w-16" />
      <Skeleton className="mt-3 h-4 w-32" />
    </div>
  );
}

function BoardRowSkeleton() {
  return (
    <div className="grid gap-3 rounded-[26px] border border-white/8 bg-black/20 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
      <div>
        <Skeleton className="h-6 w-36" />
        <Skeleton className="mt-3 h-4 w-52" />
        <Skeleton className="mt-4 h-4 w-28" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-11 w-28 rounded-full" />
        <Skeleton className="h-11 w-28 rounded-full" />
      </div>
    </div>
  );
}

function getQueueOutcomeDetail(entry: {
  convertedAppointmentId?: string;
  statusReason?: string;
}) {
  if (entry.convertedAppointmentId) {
    return "Converted into a live appointment on the schedule.";
  }

  return entry.statusReason ?? "Resolved from the queue";
}

export function FrontDeskWorkspace({ locationIds = [] }: { locationIds?: string[] }) {
  const operationsQuery = useLiveOperationsSnapshot("front_desk");
  const queueQuery = useQueueOperationsQuery();
  const transitionMutation = useAppointmentTransitionMutation();
  const checkoutMutation = useCheckoutAppointmentMutation();
  const selectedAppointmentId = useOperationsStore((state) => state.selectedAppointmentId);
  const tipAmount = useOperationsStore((state) => state.tipAmount);
  const paymentMethod = useOperationsStore((state) => state.paymentMethod);
  const pendingAppointmentIds = useOperationsStore((state) => state.pendingAppointmentIds);
  const conflictMessage = useOperationsStore((state) => state.conflictMessage);
  const setSelectedAppointmentId = useOperationsStore((state) => state.setSelectedAppointmentId);
  const setTipAmount = useOperationsStore((state) => state.setTipAmount);
  const setPaymentMethod = useOperationsStore((state) => state.setPaymentMethod);
  const setPending = useOperationsStore((state) => state.setPending);
  const setConflict = useOperationsStore((state) => state.setConflict);
  const resetCheckoutPanel = useOperationsStore((state) => state.resetCheckoutPanel);
  const [statusUpdate, setStatusUpdate] = useState<{ tone: "success" | "info"; message: string } | null>(null);

  const appointments = (operationsQuery.data?.appointments ?? []).filter((appointment) => locationIds.length === 0 || locationIds.includes(appointment.locationId));
  const clients = operationsQuery.data?.clients ?? [];
  const walkIns = (queueQuery.data?.entries ?? []).filter((entry) => locationIds.length === 0 || locationIds.includes(entry.shopId));
  const recentQueueOutcomes = (queueQuery.data?.recentResolvedEntries ?? []).filter((entry) => locationIds.length === 0 || locationIds.includes(entry.shopId));
  const kioskShops = (queueQuery.data?.shops ?? []).filter((shop) => locationIds.length === 0 || locationIds.includes(shop.id));
  const board = appointments
    .filter((appointment) => appointment.status !== "cancelled" && appointment.status !== "no_show")
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());
  const checkoutTarget = board.find((appointment) => appointment.id === selectedAppointmentId) ?? board.find(isReadyForCheckout);
  const checkoutView = checkoutTarget ? getAppointmentViewModel(checkoutTarget, clients) : undefined;
  const counts = {
    booked: board.filter((appointment) => appointment.status === "booked").length,
    checkedIn: board.filter((appointment) => appointment.status === "checked_in").length,
    inService: board.filter((appointment) => appointment.status === "in_service").length,
    readyForCheckout: board.filter(isReadyForCheckout).length
  };
  const modeLabel = operationsQuery.data?.mode === "supabase" ? "Supabase realtime active" : "Quick-start demo state";
  const nextGuest = board.find((appointment) => appointment.status === "booked");
  const nextGuestView = nextGuest ? getAppointmentViewModel(nextGuest, clients) : undefined;
  const balanceWaiting = board.reduce((sum, appointment) => sum + appointment.balanceDue, 0);
  const isInitialLoading = operationsQuery.isLoading && !operationsQuery.data;

  async function handleCheckIn(appointmentId: string, expectedRevision: number) {
    setStatusUpdate(null);
    setConflict(undefined);
    setPending(appointmentId, true);
    try {
      await transitionMutation.mutateAsync({ appointmentId, expectedRevision, action: "check_in" });
      setStatusUpdate({ tone: "success", message: "Client checked in. The ticket is ready for the barber." });
    } catch (error) {
      const apiError = error as OperationsApiError;
      setConflict(getReadableActionError(apiError), apiError.latestAppointment?.id ?? appointmentId);
    } finally {
      setPending(appointmentId, false);
    }
  }

  async function handleCheckout() {
    if (!checkoutTarget) {
      return;
    }

    setStatusUpdate(null);
    setConflict(undefined);
    setPending(checkoutTarget.id, true);
    try {
      await checkoutMutation.mutateAsync({
        appointmentId: checkoutTarget.id,
        expectedRevision: checkoutTarget.revision,
        tipAmount: Number(tipAmount) || 0,
        paymentMethod
      });
      resetCheckoutPanel();
      setStatusUpdate({ tone: "success", message: "Payment and tip captured. The ticket is now closed." });
    } catch (error) {
      const apiError = error as OperationsApiError;
      setConflict(getReadableActionError(apiError), apiError.latestAppointment?.id ?? checkoutTarget.id);
      if (apiError.latestAppointment?.id) {
        setSelectedAppointmentId(apiError.latestAppointment.id);
      }
    } finally {
      setPending(checkoutTarget.id, false);
    }
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]" data-testid="front-desk-workspace">
      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="surface-label">Desk priorities</p>
            <h3 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">See the next move instantly</h3>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">
              This board is built for speed. Check guests in, hand tickets to the floor, and close balances without digging through owner or compensation screens.
            </p>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4 text-sm text-white/68">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#C4F24E]/20 bg-[#C4F24E]/10 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[#e4f9b8]">
              <Rows3 className="h-4 w-4" />
              {modeLabel}
            </div>
            <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-white/42">Balance waiting {currency(balanceWaiting)}</p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {statusUpdate ? <FeedbackBanner tone={statusUpdate.tone} message={statusUpdate.message} /> : null}
          {conflictMessage ? <FeedbackBanner tone="error" message={conflictMessage} /> : null}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {isInitialLoading ? (
            <>
              <MetricSkeleton />
              <MetricSkeleton />
              <MetricSkeleton />
              <MetricSkeleton />
            </>
          ) : (
            <>
              <div className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
                <p className="surface-label">Booked</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{counts.booked}</p>
                <p className="mt-2 text-sm text-white/58">Guests still waiting to arrive</p>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
                <p className="surface-label">Checked in</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{counts.checkedIn}</p>
                <p className="mt-2 text-sm text-white/58">Ready for the barber handoff</p>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
                <p className="surface-label">In service</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{counts.inService}</p>
                <p className="mt-2 text-sm text-white/58">Active services currently on the floor</p>
              </div>
              <div className="rounded-[22px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 px-4 py-4">
                <p className="surface-label text-[#e4f9b8]">Ready for checkout</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{counts.readyForCheckout}</p>
                <p className="mt-2 text-sm text-white/70">Tickets waiting on payment and tip capture</p>
              </div>
            </>
          )}
        </div>

        <div className="mt-5 rounded-[24px] border border-white/8 bg-black/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="surface-label">Next desk action</p>
              <p className="mt-2 text-lg font-semibold">{nextGuest && nextGuestView ? `${nextGuestView.client?.name ?? nextGuest.clientId} is next to arrive` : "No immediate arrivals waiting"}</p>
            </div>
            <span className="status-pill text-[#e4f9b8]">{walkIns.length} walk-ins live</span>
          </div>
          <p className="mt-3 text-sm text-white/58">
            {nextGuest && nextGuestView
              ? `${nextGuestView.service?.name} at ${dateLabel(nextGuest.start)} with ${nextGuestView.barber?.name ?? nextGuest.barberId}.`
              : "The board will surface the next guest here as soon as a booked appointment needs a desk handoff."}
          </p>
        </div>

        <div className="mt-5 space-y-3">
          {isInitialLoading ? (
            <>
              <BoardRowSkeleton />
              <BoardRowSkeleton />
              <BoardRowSkeleton />
            </>
          ) : board.length ? board.map((appointment) => {
            const view = getAppointmentViewModel(appointment, clients);
            const isPending = pendingAppointmentIds.includes(appointment.id);
            return (
              <div key={appointment.id} className="grid gap-3 rounded-[26px] border border-white/8 bg-black/20 p-4 transition hover:-translate-y-0.5 hover:border-[#C4F24E]/16 hover:bg-black/30 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-lg font-semibold">{view.client?.name ?? appointment.clientId}</p>
                    <StatusBadge appointment={appointment} />
                  </div>
                  <p className="mt-2 text-sm text-white/55">{view.service?.name} | {dateLabel(appointment.start)} | {appointment.chair}</p>
                  <p className="mt-3 text-sm text-white/68">Balance due {currency(appointment.balanceDue)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {appointment.status === "booked" ? (
                    <Button className="h-11 px-4" disabled={isPending} onClick={() => void handleCheckIn(appointment.id, appointment.revision)}>
                      {isPending ? "Checking in..." : "Check in"}
                    </Button>
                  ) : null}
                  {isReadyForCheckout(appointment) ? (
                    <Button variant="secondary" className="h-11 px-4" onClick={() => setSelectedAppointmentId(appointment.id)}>Open checkout</Button>
                  ) : null}
                  {appointment.status === "checked_in" ? <span className="status-pill text-amber-300">Waiting on barber</span> : null}
                  {appointment.status === "in_service" ? <span className="status-pill text-sky-300">In service</span> : null}
                  {isAppointmentPaid(appointment) ? <span className="status-pill text-[#e4f9b8]">Paid</span> : null}
                </div>
              </div>
            );
          }) : (
            <div className="empty-state-panel rounded-[26px] p-6 text-sm leading-7 text-white/58">
              No live appointments are active for this desk view yet.
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-4">
        <KioskControlPanel shops={kioskShops} compact />
        <ShopManagerPanel compact />

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Checkout capture</p>
              <p className="mt-2 text-sm text-white/58">Close the service ticket, collect tip, and keep the line moving.</p>
            </div>
            <ReceiptText className="h-5 w-5 text-[#d9f985]" />
          </div>
          <div className="mt-5 space-y-4">
            {isInitialLoading ? (
              <div className="rounded-[26px] border border-white/8 bg-black/20 p-4">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="mt-3 h-4 w-40" />
                <Skeleton className="mt-5 h-12 w-full rounded-[24px]" />
                <Skeleton className="mt-4 h-14 w-full rounded-[24px]" />
                <Skeleton className="mt-4 h-14 w-full rounded-[24px]" />
              </div>
            ) : checkoutTarget && checkoutView ? (
              <>
                <div className="rounded-[26px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 p-4">
                  <p className="text-lg font-semibold">{checkoutView.client?.name ?? checkoutTarget.clientId}</p>
                  <p className="mt-1 text-sm text-white/62">{checkoutView.service?.name}</p>
                  <p className="mt-4 text-3xl font-semibold" data-display="true">{currency(checkoutTarget.balanceDue)}</p>
                  <p className="mt-2 text-sm text-white/62">Ready to capture now</p>
                </div>
                <div>
                  <label className="mb-3 block surface-label">Tip amount</label>
                  <Input type="number" value={tipAmount} onChange={(event) => setTipAmount(event.target.value)} />
                </div>
                <div>
                  <label className="mb-3 block surface-label">Payment method</label>
                  <Select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as "card_on_file" | "tap_to_pay")}>
                    <option value="tap_to_pay">Tap to pay</option>
                    <option value="card_on_file">Card on file</option>
                  </Select>
                </div>
                <Button className="h-12 w-full" disabled={pendingAppointmentIds.includes(checkoutTarget.id)} onClick={() => void handleCheckout()}>
                  {pendingAppointmentIds.includes(checkoutTarget.id) ? "Capturing..." : "Capture payment and tip"}
                </Button>
              </>
            ) : (
              <div className="empty-state-panel rounded-[26px] p-6 text-sm leading-7 text-white/58">
                Completed services waiting on payment will appear here so front desk can close the ticket without leaving the board.
              </div>
            )}
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Walk-in queue</p>
              <p className="mt-2 text-sm text-white/58">Assign open chairs quickly and keep the waiting room readable.</p>
            </div>
            <Users2 className="h-5 w-5 text-[#d9f985]" />
          </div>
          <div className="mt-4 space-y-3">
            {isInitialLoading ? (
              <>
                <BoardRowSkeleton />
                <BoardRowSkeleton />
              </>
            ) : walkIns.length ? walkIns.map((entry) => (
              <div key={entry.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-[#C4F24E]/16 hover:bg-black/30">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{entry.clientName}</p>
                  <span className="status-pill text-[#e4f9b8]">{entry.statusLabel}</span>
                </div>
                <p className="mt-1 text-sm text-white/55">{entry.serviceName}</p>
                <p className="mt-3 text-sm text-white/58">Wait time {entry.waitMinutes} minutes</p>
                <p className="mt-2 text-sm text-white/55">
                  {entry.assignedBarberName
                    ? `Assigned ${entry.assignedBarberName}`
                    : entry.bestAvailableBarber
                      ? `Best fit ${entry.bestAvailableBarber.barberName}`
                      : "Waiting on barber assignment"}
                </p>
                {entry.queueSource === "kiosk" ? <p className="mt-2 text-sm text-[#e4f9b8]">Captured from kiosk intake</p> : null}
              </div>
            )) : (
              <div className="empty-state-panel rounded-[24px] p-5 text-sm text-white/55">
                Live walk-ins will surface here and stay aligned with the queue board.
              </div>
            )}
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Queue outcomes</p>
              <p className="mt-2 text-sm text-white/58">Track converted and cancelled walk-ins without leaving the desk board.</p>
            </div>
            <Clock3 className="h-5 w-5 text-[#d9f985]" />
          </div>
          <div className="mt-4 space-y-3">
            {isInitialLoading ? (
              <>
                <BoardRowSkeleton />
                <BoardRowSkeleton />
              </>
            ) : recentQueueOutcomes.length ? recentQueueOutcomes.map((entry) => (
              <div key={entry.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-[#C4F24E]/16 hover:bg-black/30">
                <p className="font-medium">{entry.clientName}</p>
                <p className="mt-1 text-sm text-white/55">{entry.serviceName}</p>
                <p className="mt-3 text-sm text-white/58">
                  {getQueueOutcomeDetail(entry)}
                </p>
              </div>
            )) : (
              <div className="empty-state-panel rounded-[24px] p-5 text-sm text-white/55">
                Converted or cancelled queue outcomes will appear here as the live desk flow moves.
              </div>
            )}
          </div>
        </Card>
      </div>
    </section>
  );
}


