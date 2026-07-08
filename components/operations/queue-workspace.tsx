"use client";

import { useMemo, useState } from "react";
import { BellRing, Clock3, ListOrdered, Sparkles, UserRoundPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateQueueEntryMutation,
  useQueueEntryActionMutation,
  useQueueOperationsQuery,
  type QueueApiError
} from "@/lib/operations/queue-client";
import { getReadableActionError } from "@/lib/utils/feedback";
import type { Role } from "@/types/domain";

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function getQueueCopy(role: Extract<Role, "owner" | "manager" | "front_desk">) {
  switch (role) {
    case "owner":
      return "Watch queue pressure, same-day conversion, and chair assignment from one operational board.";
    case "manager":
      return "Run the walk-in line with clear wait times, real barber fit, and clean conversion into live appointments.";
    case "front_desk":
      return "Add the guest, route the chair, and convert demand into a real ticket without leaving the desk flow.";
    default:
      return "Queue operations stay visible here.";
  }
}

function getStatusClass(status: string) {
  switch (status) {
    case "active":
      return "text-white/72";
    case "called":
      return "text-amber-200";
    case "assigned":
      return "text-sky-200";
    case "converted":
      return "text-[#e4f9b8]";
    case "cancelled":
    case "expired":
    case "no_show":
      return "text-white/55";
    default:
      return "text-white/68";
  }
}

function MetricSkeleton() {
  return (
    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-10 w-16" />
      <Skeleton className="mt-3 h-4 w-28" />
    </div>
  );
}

type QueueFormState = {
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  shopId: string;
  serviceId: string;
  preferredBarberId: string;
  flexibilityMinutes: string;
  notes: string;
};

export function QueueWorkspace({
  viewerRole,
  locationIds
}: {
  viewerRole: Extract<Role, "owner" | "manager" | "front_desk">;
  locationIds: string[];
}) {
  const queueQuery = useQueueOperationsQuery();
  const createQueueMutation = useCreateQueueEntryMutation();
  const queueActionMutation = useQueueEntryActionMutation();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const [assignmentSelections, setAssignmentSelections] = useState<Record<string, string>>({});
  const [form, setForm] = useState<QueueFormState>({
    clientName: "",
    clientPhone: "",
    clientEmail: "",
    shopId: "",
    serviceId: "",
    preferredBarberId: "",
    flexibilityMinutes: "0",
    notes: ""
  });

  const payload = queueQuery.data;
  const isInitialLoading = queueQuery.isLoading && !payload;
  const queryError = queueQuery.error ? getReadableActionError(queueQuery.error as QueueApiError) : null;
  const scopedShops = useMemo(
    () => (payload?.shops ?? []).filter((shop) => locationIds.length === 0 || locationIds.includes(shop.id)),
    [locationIds, payload?.shops]
  );
  const selectedShopId = form.shopId || scopedShops[0]?.id || "";
  const scopedServices = useMemo(
    () => (payload?.services ?? []).filter((service) => !selectedShopId || service.shopId === selectedShopId),
    [payload?.services, selectedShopId]
  );
  const activeEntries = payload?.entries ?? [];
  const recentResolvedEntries = payload?.recentResolvedEntries ?? [];

  async function handleCreateQueueEntry() {
    setFeedback(null);

    try {
      await createQueueMutation.mutateAsync({
        clientName: form.clientName,
        clientPhone: form.clientPhone,
        clientEmail: form.clientEmail || undefined,
        shopId: selectedShopId,
        serviceId: form.serviceId || undefined,
        preferredBarberId: form.preferredBarberId || undefined,
        flexibilityMinutes: Number(form.flexibilityMinutes) || 0,
        notes: form.notes || undefined,
        queueSource: "walk_in"
      });
      setFeedback({ tone: "success", message: "Walk-in added to the live queue." });
      setForm({
        clientName: "",
        clientPhone: "",
        clientEmail: "",
        shopId: selectedShopId,
        serviceId: "",
        preferredBarberId: "",
        flexibilityMinutes: "0",
        notes: ""
      });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as QueueApiError) });
    }
  }

  async function handleQueueAction(
    entryId: string,
    action: "call" | "assign" | "convert" | "cancel",
    options?: { barberId?: string; serviceId?: string; reason?: string }
  ) {
    setFeedback(null);

    try {
      await queueActionMutation.mutateAsync({
        entryId,
        action,
        barberId: options?.barberId,
        serviceId: options?.serviceId,
        reason: options?.reason
      });
      setFeedback({
        tone: "success",
        message:
          action === "call"
            ? "Queue entry marked as called."
            : action === "assign"
              ? "Barber assignment saved."
              : action === "convert"
                ? "Queue entry converted into a real appointment."
                : "Queue entry cancelled cleanly."
      });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as QueueApiError) });
    }
  }

  return (
    <div className="space-y-4" data-testid="queue-workspace">
      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="surface-label">Walk-in queue</p>
              <h3 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">Live queue and conversion board</h3>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">{getQueueCopy(viewerRole)}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-4 text-sm text-white/68">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#C4F24E]/20 bg-[#C4F24E]/10 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[#e4f9b8]">
                <Clock3 className="h-4 w-4" />
                {payload?.summary.averageWaitMinutes ?? 0} minute average wait
              </div>
              <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-white/42">{activeEntries.length} active queue entries</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}
            {queryError ? <FeedbackBanner tone="error" message={queryError} /> : null}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {isInitialLoading ? (
              <>
                <MetricSkeleton />
                <MetricSkeleton />
                <MetricSkeleton />
              </>
            ) : (
              <>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Waiting</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">{payload?.summary.activeCount ?? 0}</p>
                  <p className="mt-2 text-sm text-white/58">Guests not yet called to a chair.</p>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Called</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">{payload?.summary.calledCount ?? 0}</p>
                  <p className="mt-2 text-sm text-white/58">Guests already contacted by the desk.</p>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Assigned</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">{payload?.summary.assignedCount ?? 0}</p>
                  <p className="mt-2 text-sm text-white/58">Entries already routed to a barber.</p>
                </div>
              </>
            )}
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Queue intake</p>
            <UserRoundPlus className="h-5 w-5 text-[#d9f985]" />
          </div>
          <div className="mt-4 grid gap-3">
            <Input
              placeholder="Client name"
              value={form.clientName}
              onChange={(event) => setForm((current) => ({ ...current, clientName: event.target.value }))}
            />
            <Input
              placeholder="Client phone"
              value={form.clientPhone}
              onChange={(event) => setForm((current) => ({ ...current, clientPhone: event.target.value }))}
            />
            <Input
              placeholder="Client email (optional)"
              value={form.clientEmail}
              onChange={(event) => setForm((current) => ({ ...current, clientEmail: event.target.value }))}
            />
            <Select
              value={selectedShopId}
              onChange={(event) => setForm((current) => ({ ...current, shopId: event.target.value }))}
            >
              <option value="">Choose shop</option>
              {scopedShops.map((shop) => (
                <option key={shop.id} value={shop.id}>{shop.label}</option>
              ))}
            </Select>
            <Select
              value={form.serviceId}
              onChange={(event) => setForm((current) => ({ ...current, serviceId: event.target.value }))}
            >
              <option value="">Service to choose later</option>
              {scopedServices.map((service) => (
                <option key={service.id} value={service.id}>{service.name}</option>
              ))}
            </Select>
            <Select
              value={form.preferredBarberId}
              onChange={(event) => setForm((current) => ({ ...current, preferredBarberId: event.target.value }))}
            >
              <option value="">Any eligible barber</option>
              {(payload?.barbers ?? []).map((barber) => (
                <option key={barber.id} value={barber.id}>{barber.name}</option>
              ))}
            </Select>
            <Input
              type="number"
              min={0}
              max={480}
              placeholder="Flexibility minutes"
              value={form.flexibilityMinutes}
              onChange={(event) => setForm((current) => ({ ...current, flexibilityMinutes: event.target.value }))}
            />
            <textarea
              className="min-h-[108px] rounded-[24px] border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-[#c4f24e]/30"
              placeholder="Queue notes (optional)"
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
            <Button
              className="h-12 w-full"
              disabled={createQueueMutation.isPending || !selectedShopId || !form.clientName.trim() || !form.clientPhone.trim()}
              onClick={() => void handleCreateQueueEntry()}
            >
              {createQueueMutation.isPending ? "Adding to queue..." : "Add walk-in"}
            </Button>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Active queue</p>
            <ListOrdered className="h-5 w-5 text-[#d9f985]" />
          </div>

          <div className="mt-4 space-y-3">
            {isInitialLoading ? (
              <>
                <MetricSkeleton />
                <MetricSkeleton />
              </>
            ) : activeEntries.length ? activeEntries.map((entry) => {
              const selectedBarberId = assignmentSelections[entry.id] || entry.assignedBarberId || entry.bestAvailableBarber?.barberId || "";
              return (
                <div key={entry.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-[#C4F24E]/16 hover:bg-black/30">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{entry.clientName}</p>
                      <p className="mt-1 text-sm text-white/58">{entry.serviceName}</p>
                    </div>
                    <span className={`status-pill ${getStatusClass(entry.status)}`}>{entry.statusLabel}</span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-[18px] border border-white/8 bg-black/18 p-3 text-sm text-white/72">
                      Joined {formatDateTime(entry.createdAt)}
                    </div>
                    <div className="rounded-[18px] border border-white/8 bg-black/18 p-3 text-sm text-white/72">
                      Waiting {entry.waitMinutes} min
                    </div>
                    <div className="rounded-[18px] border border-white/8 bg-black/18 p-3 text-sm text-white/72">
                      {entry.preferredBarberName ? `Prefers ${entry.preferredBarberName}` : "Open barber assignment"}
                    </div>
                    <div className="rounded-[18px] border border-white/8 bg-black/18 p-3 text-sm text-white/72">
                      {entry.assignedBarberName
                        ? `Assigned ${entry.assignedBarberName}`
                        : entry.bestAvailableBarber
                          ? `Best fit ${entry.bestAvailableBarber.barberName}`
                          : "Waiting on barber fit"}
                    </div>
                  </div>

                  <p className="mt-3 text-sm text-white/58">{entry.shopLabel}</p>
                  {entry.notes ? <p className="mt-2 text-sm text-white/55">{entry.notes}</p> : null}
                  {entry.bestAvailableBarber ? (
                    <p className="mt-2 text-sm text-[#e4f9b8]">
                      Best available: {entry.bestAvailableBarber.barberName}
                      {entry.bestAvailableBarber.nextAvailableAt ? ` at ${formatDateTime(entry.bestAvailableBarber.nextAvailableAt)}` : ""}
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center">
                    <Select
                      value={selectedBarberId}
                      onChange={(event) => setAssignmentSelections((current) => ({ ...current, [entry.id]: event.target.value }))}
                    >
                      <option value="">Best available barber</option>
                      {(payload?.barbers ?? []).map((barber) => (
                        <option key={barber.id} value={barber.id}>
                          {barber.name} - {barber.liveStatusLabel}
                        </option>
                      ))}
                    </Select>

                    <div className="flex flex-wrap gap-2">
                      {entry.status === "active" ? (
                        <Button
                          className="h-11 px-4"
                          variant="secondary"
                          disabled={queueActionMutation.isPending}
                          onClick={() => void handleQueueAction(entry.id, "call")}
                        >
                          Call
                        </Button>
                      ) : null}
                      {entry.status === "active" || entry.status === "called" ? (
                        <Button
                          className="h-11 px-4"
                          variant="secondary"
                          disabled={queueActionMutation.isPending}
                          onClick={() => void handleQueueAction(entry.id, "assign", { barberId: selectedBarberId || undefined })}
                        >
                          Assign
                        </Button>
                      ) : null}
                      <Button
                        className="h-11 px-4"
                        disabled={queueActionMutation.isPending || !entry.serviceId}
                        onClick={() => void handleQueueAction(entry.id, "convert", {
                          barberId: selectedBarberId || undefined,
                          serviceId: entry.serviceId
                        })}
                      >
                        Convert
                      </Button>
                      <Button
                        className="h-11 px-4"
                        variant="ghost"
                        disabled={queueActionMutation.isPending}
                        onClick={() => void handleQueueAction(entry.id, "cancel")}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div className="empty-state-panel rounded-[24px] p-6 text-sm leading-7 text-white/58">
                The live queue is clear right now. New walk-ins will appear here as soon as the desk adds them.
              </div>
            )}
          </div>
        </Card>

        <div className="grid gap-4">
          <Card className="rounded-[32px] p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="surface-label">Availability signal</p>
              <Sparkles className="h-5 w-5 text-[#d9f985]" />
            </div>
            <div className="mt-4 space-y-3">
              {(payload?.barbers ?? []).slice(0, 6).map((barber) => (
                <div key={barber.id} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{barber.name}</p>
                    <span className={`status-pill ${getStatusClass(barber.liveStatus)}`}>{barber.liveStatusLabel}</span>
                  </div>
                  <p className="mt-2 text-sm text-white/58">
                    {barber.currentShopLabel ?? "Shop context pending"}
                  </p>
                  <p className="mt-1 text-sm text-white/55">
                    {barber.nextAvailableAt ? `Next available ${formatDateTime(barber.nextAvailableAt)}` : "Next available time will update from live status."}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="rounded-[32px] p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="surface-label">Recent outcomes</p>
              <BellRing className="h-5 w-5 text-[#d9f985]" />
            </div>
            <div className="mt-4 space-y-3">
              {recentResolvedEntries.length ? recentResolvedEntries.map((entry) => (
                <div key={entry.id} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{entry.clientName}</p>
                    <span className={`status-pill ${getStatusClass(entry.status)}`}>{entry.statusLabel}</span>
                  </div>
                  <p className="mt-2 text-sm text-white/58">{entry.serviceName}</p>
                  <p className="mt-2 text-sm text-white/55">
                    {entry.convertedAppointmentId
                      ? `Converted into ${entry.convertedAppointmentId}`
                      : entry.statusReason ?? "Resolved from the live queue."}
                  </p>
                </div>
              )) : (
                <div className="empty-state-panel rounded-[22px] p-5 text-sm text-white/55">
                  Converted, cancelled, and no-show queue outcomes will appear here for the desk and manager team.
                </div>
              )}
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
