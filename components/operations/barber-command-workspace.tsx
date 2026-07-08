"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, MessageSquareText, RadioTower, Scissors, Store, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/dashboard/status-badge";
import {
  useCreateMarketplaceServiceMutation,
  useDeleteMarketplaceServiceMutation,
  useMarketplaceServiceCatalog,
  useUpdateMarketplaceServiceMutation
} from "@/lib/marketplace/client";
import { useCreateMessageThreadMutation } from "@/lib/messages/client";
import {
  useBarberLifecycleMutation,
  useBarberOverviewQuery,
  useUpdateBarberScheduleMutation,
  useUpdateBarberStatusMutation,
  type BarberApiError,
  type BarberOperationalAppointment,
  type BarberStatusView
} from "@/lib/operations/barber-client";
import { currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";

type StatusFormState = {
  liveStatus: BarberStatusView["liveStatus"];
  isOnline: boolean;
  acceptsWalkIns: boolean;
  currentShopId: string | null;
};

type AvailabilityRow = {
  weekday: number;
  enabled: boolean;
  startTime: string;
  endTime: string;
};

type ServiceDraft = {
  name: string;
  durationMin: string;
  price: string;
};

type LifecycleActionKey = "check_in" | "service_start" | "service_complete";

type LifecycleAction = {
  action: LifecycleActionKey;
  label: string;
  pendingLabel: string;
  enabled: boolean;
  successMessage: string;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTimelineTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function getClientInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function buildStatusForm(status: BarberStatusView): StatusFormState {
  return {
    liveStatus: status.liveStatus,
    isOnline: status.isOnline,
    acceptsWalkIns: status.acceptsWalkIns,
    currentShopId: status.currentShopId
  };
}

function buildAvailabilityRows(
  workingHours: Array<{ weekday: number; startTime: string; endTime: string; locationId: string }>,
  locationId: string | null
) {
  return WEEKDAY_LABELS.map((_, weekday) => {
    const match = workingHours.find((row) => row.locationId === locationId && row.weekday === weekday);
    return {
      weekday,
      enabled: Boolean(match),
      startTime: match?.startTime ?? "09:00",
      endTime: match?.endTime ?? "17:00"
    } satisfies AvailabilityRow;
  });
}

function buildServiceDraft(input: { name: string; durationMin: number; price: number }): ServiceDraft {
  return {
    name: input.name,
    durationMin: String(input.durationMin),
    price: String(input.price)
  };
}

function getLifecycleActions(appointment: BarberOperationalAppointment): LifecycleAction[] {
  const canCheckIn = appointment.status === "booked" || appointment.status === "confirmed";
  const canStart = appointment.status === "checked_in";
  const canComplete = appointment.status === "in_service";

  return [
    {
      action: "check_in",
      label: "Check In",
      pendingLabel: "Checking in...",
      enabled: canCheckIn,
      successMessage: "Client checked in. The chair is ready to start."
    },
    {
      action: "service_start",
      label: "Start Service",
      pendingLabel: "Starting...",
      enabled: canStart,
      successMessage: "Service started and the chair is now in progress."
    },
    {
      action: "service_complete",
      label: "Complete Service",
      pendingLabel: "Completing...",
      enabled: canComplete,
      successMessage: "Service completed and posted through the existing chair, wallet, and receipt rails."
    }
  ];
}

function getLiveStatusTone(status: BarberStatusView["liveStatus"]) {
  if (status === "busy") {
    return "border-[#c4f24e]/20 bg-[#c4f24e]/10 text-[#e4f9b8]";
  }

  if (status === "available") {
    return "border-emerald-300/18 bg-emerald-400/10 text-emerald-100";
  }

  if (status === "on_break") {
    return "border-amber-300/18 bg-amber-400/10 text-amber-100";
  }

  if (status === "away") {
    return "border-sky-300/18 bg-sky-400/10 text-sky-100";
  }

  return "border-white/10 bg-white/[0.04] text-white/72";
}

function CommandSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      <div className="space-y-4">
        <Skeleton className="h-44 w-full rounded-[28px]" />
        <Skeleton className="h-64 w-full rounded-[28px]" />
        <Skeleton className="h-44 w-full rounded-[28px]" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-80 w-full rounded-[28px]" />
        <Skeleton className="h-80 w-full rounded-[28px]" />
      </div>
    </div>
  );
}

function LabeledUnitInput({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  type = "text",
  prefix,
  suffix,
  min,
  step
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  type?: "text" | "number";
  prefix?: string;
  suffix?: string;
  min?: number;
  step?: number;
}) {
  return (
    <div className="card-safe">
      <label className="surface-label">{label}</label>
      <div className="relative">
        {prefix ? <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-white/48">{prefix}</span> : null}
        <Input
          type={type}
          value={value}
          min={min}
          step={step}
          disabled={disabled}
          placeholder={placeholder}
          className={prefix ? "pl-9" : suffix ? "pr-16" : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix ? <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-white/48">{suffix}</span> : null}
      </div>
    </div>
  );
}

function isPositiveNumber(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

export function BarberCommandWorkspace({ barberName }: { barberName: string }) {
  const router = useRouter();
  const overviewQuery = useBarberOverviewQuery();
  const serviceCatalogQuery = useMarketplaceServiceCatalog();
  const statusMutation = useUpdateBarberStatusMutation();
  const updateScheduleMutation = useUpdateBarberScheduleMutation();
  const lifecycleMutation = useBarberLifecycleMutation();
  const createThreadMutation = useCreateMessageThreadMutation();
  const createServiceMutation = useCreateMarketplaceServiceMutation();
  const updateServiceMutation = useUpdateMarketplaceServiceMutation();
  const deleteServiceMutation = useDeleteMarketplaceServiceMutation();
  const [statusForm, setStatusForm] = useState<StatusFormState | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [availabilityRows, setAvailabilityRows] = useState<AvailabilityRow[]>([]);
  const [serviceDrafts, setServiceDrafts] = useState<Record<string, ServiceDraft>>({});
  const [createDraft, setCreateDraft] = useState<ServiceDraft>({
    name: "",
    durationMin: "45",
    price: "60"
  });
  const [deleteServiceId, setDeleteServiceId] = useState<string | null>(null);
  const [pendingAppointmentId, setPendingAppointmentId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const payload = overviewQuery.data;
  const shops = payload?.shops ?? [];
  const nextGuest = payload?.nextAppointment ?? null;
  const earnings = payload?.earnings;
  const errorMessage = overviewQuery.error ? getReadableActionError(overviewQuery.error as BarberApiError) : null;

  const editableServices = serviceCatalogQuery.data?.editableServices ?? [];
  const visibleServices = editableServices.length
    ? editableServices
    : (serviceCatalogQuery.data?.readOnlyServices ?? []).slice(0, 4);

  useEffect(() => {
    if (!payload?.status) {
      return;
    }

    setStatusForm(buildStatusForm(payload.status));
    const initialLocationId = payload.status.currentShopId ?? payload.shops[0]?.id ?? null;
    setSelectedLocationId(initialLocationId);
    setAvailabilityRows(buildAvailabilityRows(payload.workingHours, initialLocationId));
  }, [payload]);

  useEffect(() => {
    if (!payload) {
      return;
    }

    setAvailabilityRows(buildAvailabilityRows(payload.workingHours, selectedLocationId));
  }, [payload, selectedLocationId]);

  async function handleSaveStatus() {
    if (!statusForm) {
      return;
    }

    setFeedback(null);
    try {
      await statusMutation.mutateAsync(statusForm);
      setFeedback({ tone: "success", message: "Chair status updated for discovery, walk-ins, and live chair visibility." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    }
  }

  async function handleLifecycleAction(appointment: BarberOperationalAppointment, action: LifecycleAction) {
    if (!action.enabled) {
      return;
    }

    setFeedback(null);
    setPendingAppointmentId(appointment.id);

    try {
      await lifecycleMutation.mutateAsync({
        appointmentId: appointment.id,
        expectedRevision: appointment.revision,
        action: action.action
      });
      setFeedback({ tone: "success", message: action.successMessage });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    } finally {
      setPendingAppointmentId(null);
    }
  }

  async function handleMessage(appointment: BarberOperationalAppointment) {
    setFeedback(null);
    try {
      const thread = await createThreadMutation.mutateAsync({ appointmentId: appointment.id });
      if (thread.thread?.id) {
        router.push(`/dashboard/barber/messages/${thread.thread.id}`);
      }
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    }
  }

  async function handleSaveAvailability() {
    if (!selectedLocationId) {
      setFeedback({ tone: "error", message: "Choose a chair territory before saving weekly availability." });
      return;
    }

    setFeedback(null);
    try {
      await updateScheduleMutation.mutateAsync({
        locationId: selectedLocationId,
        workingHours: availabilityRows
          .filter((row) => row.enabled)
          .map((row) => ({
            weekday: row.weekday,
            startTime: row.startTime,
            endTime: row.endTime
          }))
      });
      setFeedback({ tone: "success", message: "Weekly availability updated for the selected chair territory." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    }
  }

  function updateAvailabilityRow(weekday: number, patch: Partial<AvailabilityRow>) {
    setAvailabilityRows((current) =>
      current.map((row) => (row.weekday === weekday ? { ...row, ...patch } : row))
    );
  }

  function updateServiceDraft(serviceId: string, patch: Partial<ServiceDraft>) {
    const existing = visibleServices.find((item) => item.service.id === serviceId)?.service;
    if (!existing) {
      return;
    }

    setServiceDrafts((current) => ({
      ...current,
      [serviceId]: {
        ...(current[serviceId] ?? buildServiceDraft(existing)),
        ...patch
      }
    }));
  }

  async function handleCreateService() {
    if (!serviceCatalogQuery.data?.canCreate || !createDraft.name.trim()) {
      return;
    }

    if (!isPositiveNumber(createDraft.durationMin)) {
      setFeedback({ tone: "error", message: "Duration must be greater than zero." });
      return;
    }

    if (!isPositiveNumber(createDraft.price)) {
      setFeedback({ tone: "error", message: "Price must be greater than zero." });
      return;
    }

    setFeedback(null);
    try {
      await createServiceMutation.mutateAsync({
        category: "Signature",
        name: createDraft.name.trim(),
        description: "",
        durationMin: Number(createDraft.durationMin) || 45,
        bufferMin: 10,
        price: Number(createDraft.price) || 0,
        deposit: 0,
        fullPrepay: false,
        styleTagIds: []
      });
      setCreateDraft({ name: "", durationMin: "45", price: "60" });
      setFeedback({ tone: "success", message: "Service added to the barber catalog." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    }
  }

  async function handleSaveService(serviceId: string) {
    const existing = visibleServices.find((item) => item.service.id === serviceId)?.service;
    const draft = existing ? serviceDrafts[serviceId] ?? buildServiceDraft(existing) : null;
    if (!draft) {
      return;
    }

    if (!draft.name.trim()) {
      setFeedback({ tone: "error", message: "Service name is required." });
      return;
    }

    if (!isPositiveNumber(draft.durationMin)) {
      setFeedback({ tone: "error", message: "Duration must be greater than zero." });
      return;
    }

    if (!isPositiveNumber(draft.price)) {
      setFeedback({ tone: "error", message: "Price must be greater than zero." });
      return;
    }

    setFeedback(null);
    try {
      await updateServiceMutation.mutateAsync({
        serviceId,
        name: draft.name.trim(),
        category: existing?.category ?? "Signature",
        description: existing?.description ?? "",
        durationMin: Number(draft.durationMin) || 45,
        bufferMin: existing?.bufferMin ?? 10,
        price: Number(draft.price) || 0,
        deposit: existing?.deposit ?? 0,
        styleTagIds: existing?.styleTagIds ?? []
      });
      setFeedback({ tone: "success", message: "Service details updated." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    }
  }

  async function handleDeleteService() {
    if (!deleteServiceId) {
      return;
    }

    setFeedback(null);
    try {
      await deleteServiceMutation.mutateAsync({ serviceId: deleteServiceId });
      setFeedback({ tone: "success", message: "Service removed from the active barber catalog." });
      setDeleteServiceId(null);
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    }
  }

  return (
    <div className="space-y-4" data-testid="barber-command-workspace">
      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="surface-label">Barber Command</p>
            <h3 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">
              {barberName}
            </h3>
            <p className="mt-3 text-sm text-white/62">Run the chair. Keep the day moving. Stay paid.</p>
          </div>
          <div className="rounded-[22px] border border-[#c4f24e]/16 bg-[#c4f24e]/10 px-4 py-3 text-right">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#e4f9b8]">Chair control</p>
            <p className="mt-2 text-sm font-medium text-white">{payload?.status.currentShopLabel ?? "No territory selected"}</p>
            <p className="mt-1 text-sm text-white/58">{payload?.status.liveStatusLabel ?? "Offline"}</p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}
          {errorMessage ? <FeedbackBanner tone="error" message={errorMessage} /> : null}
        </div>
      </Card>

      {overviewQuery.isLoading && !payload ? (
        <CommandSkeleton />
      ) : (
        <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4">
            <Card className="rounded-[32px] p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="surface-label">Live chair status</p>
                </div>
                <span className={`status-pill ${getLiveStatusTone(payload?.status.liveStatus ?? "offline")}`}>
                  {payload?.status.liveStatusLabel ?? "Offline"}
                </span>
              </div>

              <div className="mt-4 grid gap-3">
                <Select
                  value={statusForm?.liveStatus ?? "available"}
                  onChange={(event) =>
                    setStatusForm((current) =>
                      current
                        ? { ...current, liveStatus: event.target.value as BarberStatusView["liveStatus"] }
                        : current
                    )
                  }
                >
                  <option value="offline">Offline</option>
                  <option value="available">Available</option>
                  <option value="busy">Busy</option>
                  <option value="on_break">On break</option>
                  <option value="away">Away</option>
                </Select>

                <Select
                  value={statusForm?.currentShopId ?? ""}
                  onChange={(event) => {
                    const value = event.target.value || null;
                    setStatusForm((current) => (current ? { ...current, currentShopId: value } : current));
                    setSelectedLocationId(value);
                  }}
                >
                  <option value="">No shop selected</option>
                  {shops.map((shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.label}
                    </option>
                  ))}
                </Select>

                <label className="flex items-center gap-3 rounded-[18px] border border-white/8 bg-black/18 px-4 py-3 text-sm text-white/72">
                  <input
                    type="checkbox"
                    checked={statusForm?.isOnline ?? false}
                    onChange={(event) =>
                      setStatusForm((current) => (current ? { ...current, isOnline: event.target.checked } : current))
                    }
                    className="h-4 w-4 rounded border-white/20 bg-black"
                  />
                  Show barber as online
                </label>

                <label className="flex items-center gap-3 rounded-[18px] border border-white/8 bg-black/18 px-4 py-3 text-sm text-white/72">
                  <input
                    type="checkbox"
                    checked={statusForm?.acceptsWalkIns ?? false}
                    onChange={(event) =>
                      setStatusForm((current) =>
                        current ? { ...current, acceptsWalkIns: event.target.checked } : current
                      )
                    }
                    className="h-4 w-4 rounded border-white/20 bg-black"
                  />
                  Accept walk-ins
                </label>
              </div>

              <div className="mt-4">
                <Button className="h-11 px-4" disabled={statusMutation.isPending || !statusForm} onClick={() => void handleSaveStatus()}>
                  {statusMutation.isPending ? "Saving..." : "Save status"}
                </Button>
              </div>
            </Card>

            <Card className="rounded-[32px] p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="surface-label">Next guest</p>
                </div>
                <Scissors className="h-5 w-5 text-[#d9f985]" />
              </div>

              {nextGuest ? (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center gap-4 rounded-[24px] border border-white/8 bg-black/20 p-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-[#c4f24e]/18 bg-[#c4f24e]/10 text-xl font-semibold text-[#e4f9b8]">
                      {getClientInitials(nextGuest.display.clientName)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xl font-semibold text-white">{nextGuest.display.clientName}</p>
                      <p className="mt-1 text-sm text-white/58">{nextGuest.display.serviceName}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-white/68">
                        <span className="status-pill text-white/72">{formatTimelineTime(nextGuest.start)}</span>
                        <span className="status-pill text-white/72">{nextGuest.display.locationLabel}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <StatusBadge status={nextGuest.status} balanceDue={nextGuest.balanceDue} />
                    <span className="status-pill text-white/72">{nextGuest.display.statusLabel}</span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {getLifecycleActions(nextGuest).map((action) => {
                      const isPending = lifecycleMutation.isPending && pendingAppointmentId === nextGuest.id && action.enabled;
                      return (
                        <Button
                          key={action.action}
                          type="button"
                          className="h-11 px-4"
                          variant={action.enabled ? "primary" : "secondary"}
                          disabled={!action.enabled || isPending}
                          onClick={() => void handleLifecycleAction(nextGuest, action)}
                        >
                          {isPending ? action.pendingLabel : action.label}
                        </Button>
                      );
                    })}
                    <Button
                      type="button"
                      className="h-11 px-4"
                      variant="secondary"
                      disabled={createThreadMutation.isPending}
                      onClick={() => void handleMessage(nextGuest)}
                    >
                      <MessageSquareText className="h-4 w-4" />
                      {createThreadMutation.isPending ? "Opening..." : "Message Client"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-[22px] border border-dashed border-white/10 bg-black/18 px-4 py-5 text-sm text-white/58">
                  No guest is currently queued for the chair.
                </div>
              )}
            </Card>

            <Card className="rounded-[32px] p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="surface-label">Today performance</p>
                </div>
                <RadioTower className="h-5 w-5 text-[#d9f985]" />
              </div>

              <div className="mt-4 grid gap-3">
                <div className="rounded-[20px] border border-[#c4f24e]/18 bg-[#c4f24e]/8 p-4">
                  <p className="surface-label text-[#e4f9b8]">Today earnings</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">
                    {currency(earnings?.grossSales ?? 0)}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                    <p className="surface-label">Clients rebooked today</p>
                    <p className="mt-3 text-2xl font-semibold">{earnings?.clientsRebookedToday ?? 0}</p>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                    <p className="surface-label">Tips today</p>
                    <p className="mt-3 text-2xl font-semibold">{currency(earnings?.tips ?? 0)}</p>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="rounded-[32px] p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="surface-label">Weekly availability</p>
                </div>
                <CalendarRange className="h-5 w-5 text-[#e4f9b8]" />
              </div>

              <div className="mt-4 space-y-3">
                <Select value={selectedLocationId ?? ""} onChange={(event) => setSelectedLocationId(event.target.value || null)}>
                  <option value="">Choose location</option>
                  {shops.map((shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.label}
                    </option>
                  ))}
                </Select>

                <div className="space-y-2">
                  {availabilityRows.map((row) => (
                    <div key={row.weekday} className="grid gap-2 rounded-[18px] border border-white/8 bg-black/18 p-3 sm:grid-cols-[56px_110px_110px_auto] sm:items-center">
                      <span className="text-sm font-medium text-white">{WEEKDAY_LABELS[row.weekday]}</span>
                      <Input
                        type="time"
                        value={row.startTime}
                        disabled={!row.enabled}
                        onChange={(event) => updateAvailabilityRow(row.weekday, { startTime: event.target.value })}
                      />
                      <Input
                        type="time"
                        value={row.endTime}
                        disabled={!row.enabled}
                        onChange={(event) => updateAvailabilityRow(row.weekday, { endTime: event.target.value })}
                      />
                      <label className="flex items-center gap-2 text-sm text-white/68">
                        <input
                          type="checkbox"
                          checked={row.enabled}
                          onChange={(event) => updateAvailabilityRow(row.weekday, { enabled: event.target.checked })}
                          className="h-4 w-4 rounded border-white/20 bg-black"
                        />
                        Live
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <Button className="h-11 px-4" disabled={updateScheduleMutation.isPending || !selectedLocationId} onClick={() => void handleSaveAvailability()}>
                  {updateScheduleMutation.isPending ? "Saving..." : "Save weekly availability"}
                </Button>
              </div>
            </Card>

            <Card className="rounded-[32px] p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="surface-label">Service builder</p>
                </div>
                <Store className="h-5 w-5 text-[#e4f9b8]" />
              </div>

              {serviceCatalogQuery.data?.canCreate ? (
                <div className="mt-4 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.45fr)_minmax(0,0.45fr)]">
                    <div className="card-safe">
                      <label className="surface-label">Service name</label>
                      <Input
                        placeholder="Create your first service"
                        value={createDraft.name}
                        onChange={(event) => setCreateDraft((current) => ({ ...current, name: event.target.value }))}
                      />
                    </div>
                    <LabeledUnitInput
                      label="Duration (minutes)"
                      type="number"
                      min={1}
                      suffix="min"
                      value={createDraft.durationMin}
                      onChange={(value) => setCreateDraft((current) => ({ ...current, durationMin: value }))}
                    />
                    <LabeledUnitInput
                      label="Price ($)"
                      type="number"
                      min={0.01}
                      step={0.01}
                      prefix="$"
                      value={createDraft.price}
                      onChange={(value) => setCreateDraft((current) => ({ ...current, price: value }))}
                    />
                  </div>

                  <Button
                    className="h-11 px-4"
                    disabled={createServiceMutation.isPending || !createDraft.name.trim() || !isPositiveNumber(createDraft.durationMin) || !isPositiveNumber(createDraft.price)}
                    onClick={() => void handleCreateService()}
                  >
                    {createServiceMutation.isPending ? "Adding..." : "Add service"}
                  </Button>
                </div>
              ) : (
                <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 p-4 text-sm text-white/58">
                  This barber can perform the catalog, but shop-owned pricing stays protected.
                </div>
              )}

              <div className="mt-4 space-y-3">
                {!visibleServices.length ? (
                  <div className="rounded-[22px] border border-dashed border-white/10 bg-black/18 p-4 text-sm text-white/58">
                    Create your first service
                  </div>
                ) : null}

                {visibleServices.slice(0, 4).map((item) => {
                  const draft = serviceDrafts[item.service.id] ?? buildServiceDraft(item.service);
                  const canEdit = editableServices.some((entry) => entry.service.id === item.service.id);
                  return (
                    <div key={item.service.id} className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.45fr)_minmax(0,0.45fr)]">
                        <div className="card-safe">
                          <label className="surface-label">Service name</label>
                          <Input
                            value={draft.name}
                            disabled={!canEdit}
                            onChange={(event) => updateServiceDraft(item.service.id, { name: event.target.value })}
                          />
                        </div>
                        <LabeledUnitInput
                          label="Duration (minutes)"
                          type="number"
                          min={1}
                          suffix="min"
                          disabled={!canEdit}
                          value={draft.durationMin}
                          onChange={(value) => updateServiceDraft(item.service.id, { durationMin: value })}
                        />
                        <LabeledUnitInput
                          label="Price ($)"
                          type="number"
                          min={0.01}
                          step={0.01}
                          prefix="$"
                          disabled={!canEdit}
                          value={draft.price}
                          onChange={(value) => updateServiceDraft(item.service.id, { price: value })}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          className="h-11 px-4"
                          disabled={!canEdit || updateServiceMutation.isPending}
                          onClick={() => void handleSaveService(item.service.id)}
                        >
                          Save
                        </Button>
                        {canEdit ? (
                          <Button
                            variant="ghost"
                            className="h-11 border border-[#ff6a6a]/32 px-4 text-[#ff9d9d] hover:border-[#ff6a6a]/52 hover:bg-[#ff6a6a]/10 hover:text-white"
                            disabled={deleteServiceMutation.isPending}
                            onClick={() => setDeleteServiceId(item.service.id)}
                          >
                            <Trash2 className="icon-safe" />
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </section>
      )}

      {deleteServiceId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 px-4">
          <Card className="w-full max-w-md rounded-[30px] p-6">
            <p className="surface-label text-[#ffb0b0]">Confirm delete</p>
            <h3 className="mt-3 text-2xl font-semibold" data-display="true">Delete this service?</h3>
            <p className="mt-3 text-sm leading-7 text-white/62">
              This removes the service from the active barber catalog and discovery surfaces.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                variant="ghost"
                className="h-11 border border-[#ff6a6a]/32 px-4 text-[#ff9d9d] hover:border-[#ff6a6a]/52 hover:bg-[#ff6a6a]/10 hover:text-white"
                disabled={deleteServiceMutation.isPending}
                onClick={() => void handleDeleteService()}
              >
                {deleteServiceMutation.isPending ? "Deleting..." : "Delete service"}
              </Button>
              <Button variant="secondary" className="h-11 px-4" disabled={deleteServiceMutation.isPending} onClick={() => setDeleteServiceId(null)}>
                Keep service
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
