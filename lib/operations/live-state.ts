import { boothRentLedger, demoAppointments, demoBarbers, demoClients, demoUsers, demoWalkIns } from "@/lib/data/demo";
import { buildAppointmentLifecycleFields, canTransitionAppointmentStatus, type AppointmentFinancialQuote } from "@/lib/appointments/domain";
import {
  CompensationSnapshotRecord,
  OwnerAnalyticsSnapshotRecord,
  WorkflowEventRecord,
  buildCompensationSnapshot,
  buildOwnerAnalyticsSnapshot,
  buildWorkflowEventRecord
} from "@/lib/operations/persistence";
import { calculateBookingQuote, getBarber, getService } from "@/lib/utils/booking";
import { CheckoutRecord, FlowActivity } from "@/lib/utils/operations";
import { Appointment, AppointmentStatus, Client, Role, Service, WalkInEntry } from "@/types/domain";

export type LiveActorRole = Extract<Role, "owner" | "manager" | "front_desk" | "client"> | "barber";
export type AppointmentLifecycleAction = "check_in" | "service_start" | "service_complete";
export type LiveOperationsMode = "demo" | "supabase";

export interface LiveAppointmentRecord extends Appointment {
  revision: number;
  updatedAt: string;
  lastActorRole?: LiveActorRole;
  lastEventType?: FlowActivity["type"];
  checkoutReference?: string;
}

export interface LiveOperationsSnapshot {
  mode: LiveOperationsMode;
  fetchedAt: string;
  appointments: LiveAppointmentRecord[];
  clients: Client[];
  walkIns: WalkInEntry[];
  workflowEvents: WorkflowEventRecord[];
  compensationSnapshots: CompensationSnapshotRecord[];
  ownerAnalytics: OwnerAnalyticsSnapshotRecord[];
}

export interface LiveOperationsViewer {
  role: Role | "public";
  locationIds?: string[];
  barberId?: string;
  clientId?: string;
  email?: string;
}

export interface BookingMutationInput {
  locationId: string;
  barberId: string;
  serviceId: string;
  addOnIds: string[];
  appointmentTime: string;
  clientName: string;
  clientPhone: string;
  clientId?: string;
  actorRole?: LiveActorRole;
  actorEmail?: string;
  confirmationCode?: string;
  membershipId?: string;
  bookingSource?: string;
  source?: Appointment["source"];
  promotionId?: string;
  promotionCode?: string;
  pointsToRedeem?: number;
  pointsUserId?: string;
  createdBy?: string;
  internalNotes?: string;
  pricingSnapshot?: AppointmentFinancialQuote;
}

export interface AppointmentLifecycleMutationInput {
  appointmentId: string;
  expectedRevision: number;
  action: AppointmentLifecycleAction;
  actorRole: Extract<LiveActorRole, "owner" | "manager" | "front_desk" | "barber">;
  actorEmail?: string;
}

export interface CheckoutMutationInput {
  appointmentId: string;
  expectedRevision: number;
  tipAmount: number;
  paymentMethod: CheckoutRecord["paymentMethod"];
  actorRole: Extract<LiveActorRole, "owner" | "manager" | "front_desk">;
  actorEmail?: string;
}

export interface CancelAppointmentMutationInput {
  appointmentId: string;
  expectedRevision: number;
  actorRole: Extract<LiveActorRole, "owner" | "manager" | "front_desk" | "client">;
  actorEmail?: string;
  reason?: string;
}

export interface LiveMutationSuccess {
  appointment: LiveAppointmentRecord;
  snapshot: LiveOperationsSnapshot;
}

export class LiveOperationConflictError extends Error {
  readonly status = 409;

  constructor(
    message: string,
    readonly latestAppointment: LiveAppointmentRecord,
    readonly code: "stale_revision" | "invalid_transition" | "schedule_conflict" | "invalid_cancellation"
  ) {
    super(message);
    this.name = "LiveOperationConflictError";
  }
}

export class LiveOperationValidationError extends Error {
  readonly status = 400;

  constructor(
    message: string,
    readonly code: "invalid_booking_selection" | "invalid_resource_reference" | "verification_blocked" = "invalid_booking_selection",
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "LiveOperationValidationError";
  }
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "guest";
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function createSyntheticCheckout(appointment: Appointment): CheckoutRecord {
  return {
    id: `checkout-${appointment.id}`,
    appointmentId: appointment.id,
    locationId: appointment.locationId,
    barberId: appointment.barberId,
    clientId: appointment.clientId,
    amountCollected: Math.max(appointment.totalAmount - appointment.depositAmount, 0),
    tipAmount: appointment.tipAmount,
      paymentMethod: "card_on_file",
      provider: "stripe",
    collectedAt: appointment.end
  };
}

function getBarberEmail(barberId: string) {
  const barber = demoBarbers.find((entry) => entry.id === barberId);
  const user = demoUsers.find((entry) => entry.id === barber?.userId);
  return user?.email ?? `${barberId}@bvrb3r.local`;
}

function getClientEmail(client?: Client, fallbackClientId?: string) {
  if (client?.email) {
    return client.email;
  }

  return fallbackClientId ? `${fallbackClientId}@guest.bvrb3r.local` : "guest@bvrb3r.local";
}

function createWorkflowActivity(
  appointment: Appointment,
  actorRole: LiveActorRole,
  type: FlowActivity["type"],
  detail: string,
  createdAt: string,
  title: string
): FlowActivity {
  return {
    id: createId("activity"),
    appointmentId: appointment.id,
    actorRole,
    type,
    detail,
    createdAt,
    title
  };
}

function createSeedActivity(appointment: Appointment): FlowActivity | null {
  switch (appointment.status) {
    case "booked":
      return createWorkflowActivity(appointment, "client", "booking", `${appointment.id} is booked and awaiting check-in`, appointment.start, "Client booked appointment");
    case "checked_in":
      return createWorkflowActivity(appointment, "front_desk", "check_in", `${appointment.id} is checked in and waiting on the chair`, appointment.start, "Front desk checked in client");
    case "in_service":
      return createWorkflowActivity(appointment, "barber", "service_start", `${appointment.id} is in service`, appointment.start, "Barber started service");
    case "completed":
      return appointment.balanceDue <= 0
        ? createWorkflowActivity(appointment, "front_desk", "checkout", `${appointment.id} completed with payment captured`, appointment.end, "Checkout captured payment and tip")
        : createWorkflowActivity(appointment, "barber", "service_complete", `${appointment.id} completed and posted to the shop dashboard`, appointment.end, "Barber completed service");
    default:
      return null;
  }
}

function getSeedRevision(status: AppointmentStatus) {
  switch (status) {
    case "checked_in":
      return 2;
    case "in_service":
      return 3;
    case "completed":
      return 4;
    default:
      return 1;
  }
}

function toLiveAppointmentRecord(appointment: Appointment): LiveAppointmentRecord {
  return {
    ...appointment,
    revision: getSeedRevision(appointment.status),
    updatedAt: appointment.status === "completed" ? appointment.end : appointment.start
  };
}

function sortAppointments(appointments: LiveAppointmentRecord[]) {
  return [...appointments].sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());
}

function sortWorkflowEvents(events: WorkflowEventRecord[]) {
  return [...events].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function upsertCompensationSnapshot(
  snapshots: CompensationSnapshotRecord[],
  nextSnapshot: CompensationSnapshotRecord | null,
  appointmentReference: string
) {
  const filtered = snapshots.filter((entry) => entry.appointmentReference !== appointmentReference);
  if (!nextSnapshot) {
    return filtered;
  }

  return [nextSnapshot, ...filtered].sort((left, right) => right.capturedAt.localeCompare(left.capturedAt));
}

function upsertOwnerAnalytics(
  analyticsRows: OwnerAnalyticsSnapshotRecord[],
  nextRow: OwnerAnalyticsSnapshotRecord
) {
  const filtered = analyticsRows.filter(
    (entry) => !(entry.locationReference === nextRow.locationReference && entry.businessDate === nextRow.businessDate)
  );

  return [nextRow, ...filtered].sort((left, right) => right.businessDate.localeCompare(left.businessDate));
}

function applyPersistenceArtifacts(
  snapshot: LiveOperationsSnapshot,
  appointment: LiveAppointmentRecord,
  latestActivity: FlowActivity,
  checkout?: CheckoutRecord
): LiveOperationsSnapshot {
  const barber = demoBarbers.find((entry) => entry.id === appointment.barberId);
  if (!barber) {
    return snapshot;
  }

  const client = snapshot.clients.find((entry) => entry.id === appointment.clientId);
  const locationAppointments = snapshot.appointments.filter((entry) => entry.locationId === appointment.locationId);
  const workflowEvent = buildWorkflowEventRecord({
    appointment,
    appointments: locationAppointments,
    barber,
    client,
    latestActivity,
    checkout,
    rentEntries: boothRentLedger
  });
  const compensationSnapshot = buildCompensationSnapshot({
    appointment,
    appointments: locationAppointments,
    barber,
    client,
    latestActivity,
    checkout,
    rentEntries: boothRentLedger
  });
  const ownerAnalyticsSnapshot = buildOwnerAnalyticsSnapshot(appointment.locationId, locationAppointments);

  return {
    ...snapshot,
    fetchedAt: new Date().toISOString(),
    workflowEvents: sortWorkflowEvents([
      {
        ...workflowEvent,
        barberEmail: getBarberEmail(appointment.barberId),
        clientEmail: getClientEmail(client, appointment.clientId)
      },
      ...snapshot.workflowEvents
    ]),
    compensationSnapshots: upsertCompensationSnapshot(snapshot.compensationSnapshots, compensationSnapshot ? {
      ...compensationSnapshot,
      barberEmail: getBarberEmail(appointment.barberId),
      clientEmail: getClientEmail(client, appointment.clientId)
    } : null, appointment.id),
    ownerAnalytics: upsertOwnerAnalytics(snapshot.ownerAnalytics, ownerAnalyticsSnapshot)
  };
}

function assertRevision(appointment: LiveAppointmentRecord, expectedRevision: number) {
  if (appointment.revision !== expectedRevision) {
    throw new LiveOperationConflictError(
      `Appointment ${appointment.id} has already changed. Refresh to continue.`,
      appointment,
      "stale_revision"
    );
  }
}

function assertStatusTransition(appointment: LiveAppointmentRecord, action: AppointmentLifecycleAction) {
  const nextStatus = nextStatusForAction(action);
  if (!canTransitionAppointmentStatus(appointment.status, nextStatus)) {
    throw new LiveOperationConflictError(
      `Appointment ${appointment.id} is ${appointment.status.replaceAll("_", " ")} and cannot run ${action.replaceAll("_", " ")}.`,
      appointment,
      "invalid_transition"
    );
  }
}

function nextStatusForAction(action: AppointmentLifecycleAction): AppointmentStatus {
  switch (action) {
    case "check_in":
      return "checked_in";
    case "service_start":
      return "in_service";
    case "service_complete":
      return "completed";
    default:
      return "booked";
  }
}

function hasSchedulingConflict(
  appointments: LiveAppointmentRecord[],
  barberId: string,
  appointmentId: string | undefined,
  startIso: string,
  endIso: string
) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();

  return appointments.find((appointment) => {
    if (appointment.barberId !== barberId) {
      return false;
    }
    if (appointment.id === appointmentId) {
      return false;
    }
    if (appointment.status === "cancelled" || appointment.status === "no_show") {
      return false;
    }

    const appointmentStart = new Date(appointment.start).getTime();
    const appointmentEnd = new Date(appointment.end).getTime();
    return start < appointmentEnd && end > appointmentStart;
  });
}

function assertBookingAvailability(
  snapshot: LiveOperationsSnapshot,
  input: BookingMutationInput,
  endIso: string
) {
  const conflictingAppointment = hasSchedulingConflict(
    snapshot.appointments,
    input.barberId,
    undefined,
    input.appointmentTime,
    endIso
  );

  if (conflictingAppointment) {
    throw new LiveOperationConflictError(
      `The selected time is no longer available with this barber.`,
      conflictingAppointment,
      "schedule_conflict"
    );
  }
}

function assertCancelable(appointment: LiveAppointmentRecord) {
  if (appointment.status === "completed" || appointment.status === "cancelled" || appointment.status === "no_show") {
    throw new LiveOperationConflictError(
      `Appointment ${appointment.id} is ${appointment.status.replaceAll("_", " ")} and can no longer be cancelled.`,
      appointment,
      "invalid_cancellation"
    );
  }
}

function createMutationActivity(
  appointment: LiveAppointmentRecord,
  actorRole: LiveActorRole,
  action: AppointmentLifecycleAction | "booking" | "checkout" | "cancel",
  createdAt: string,
  amountCollected = 0,
  tipAmount = 0
): FlowActivity {
  switch (action) {
    case "booking":
      return createWorkflowActivity(
        appointment,
        actorRole,
        "booking",
        `${appointment.id} reserved ${getService(appointment.serviceId)?.name ?? appointment.serviceId}`,
        createdAt,
        "Client booked appointment"
      );
    case "check_in":
      return createWorkflowActivity(
        appointment,
        actorRole,
        "check_in",
        `${appointment.id} moved to checked-in status`,
        createdAt,
        "Front desk checked in client"
      );
    case "service_start":
      return createWorkflowActivity(
        appointment,
        actorRole,
        "service_start",
        `${appointment.id} is now in service`,
        createdAt,
        "Barber started service"
      );
    case "service_complete":
      return createWorkflowActivity(
        appointment,
        actorRole,
        "service_complete",
        `${appointment.id} completed and posted to the shop dashboard`,
        createdAt,
        "Barber completed service"
      );
    case "checkout":
      return createWorkflowActivity(
        appointment,
        actorRole,
        "checkout",
        `${appointment.id} collected ${amountCollected} plus ${tipAmount} tip`,
        createdAt,
        "Checkout captured payment and tip"
      );
    case "cancel":
      return createWorkflowActivity(
        appointment,
        actorRole,
        "cancel",
        `${appointment.id} was cancelled before service began`,
        createdAt,
        "Appointment cancelled"
      );
    default:
      return createWorkflowActivity(appointment, actorRole, "booking", `${appointment.id} updated`, createdAt, "Workflow updated");
  }
}

export function createInitialLiveOperationsSnapshot(mode: LiveOperationsMode = "demo"): LiveOperationsSnapshot {
  let snapshot: LiveOperationsSnapshot = {
    mode,
    fetchedAt: new Date().toISOString(),
    appointments: sortAppointments(demoAppointments.map(toLiveAppointmentRecord)),
    clients: demoClients.map((client) => ({ ...client, notes: [...client.notes] })),
    walkIns: demoWalkIns.map((entry) => ({ ...entry })),
    workflowEvents: [],
    compensationSnapshots: [],
    ownerAnalytics: []
  };

  for (const appointment of snapshot.appointments) {
    const activity = createSeedActivity(appointment);
    if (!activity) {
      continue;
    }

    snapshot = applyPersistenceArtifacts(
      snapshot,
      appointment,
      activity,
      appointment.status === "completed" && appointment.balanceDue <= 0 ? createSyntheticCheckout(appointment) : undefined
    );
  }

  return snapshot;
}

export function scopeLiveOperationsSnapshot(snapshot: LiveOperationsSnapshot, viewer: LiveOperationsViewer): LiveOperationsSnapshot {
  if (viewer.role === "owner") {
    return snapshot;
  }

  if (viewer.role === "public") {
    return {
      ...snapshot,
      clients: [],
      workflowEvents: [],
      compensationSnapshots: [],
      ownerAnalytics: []
    };
  }

  const locationIds = viewer.locationIds ?? [];
  const baseAppointments = snapshot.appointments.filter((appointment) => {
    if (viewer.role === "manager" || viewer.role === "front_desk") {
      return locationIds.length === 0 || locationIds.includes(appointment.locationId);
    }

    if (viewer.role === "commission_barber" || viewer.role === "booth_rent_barber") {
      return appointment.barberId === viewer.barberId;
    }

    if (viewer.role === "client") {
      return appointment.clientId === viewer.clientId;
    }

    return true;
  });

  const appointmentIds = new Set(baseAppointments.map((entry) => entry.id));
  const clientIds = new Set(baseAppointments.map((entry) => entry.clientId));

  return {
    ...snapshot,
    appointments: baseAppointments,
    clients: snapshot.clients.filter((entry) => clientIds.has(entry.id)),
    walkIns:
      viewer.role === "manager" || viewer.role === "front_desk"
        ? snapshot.walkIns.filter((entry) => locationIds.length === 0 || locationIds.includes(entry.locationId))
        : [],
    workflowEvents: viewer.role === "client" ? [] : snapshot.workflowEvents.filter((entry) => appointmentIds.has(entry.appointmentReference)),
    compensationSnapshots:
      viewer.role === "commission_barber" || viewer.role === "booth_rent_barber"
        ? snapshot.compensationSnapshots.filter((entry) => entry.barberReference === viewer.barberId)
        : viewer.role === "manager" || viewer.role === "front_desk" || viewer.role === "client"
          ? []
          : snapshot.compensationSnapshots,
    ownerAnalytics:
      viewer.role === "manager"
        ? snapshot.ownerAnalytics.filter((entry) => locationIds.length === 0 || locationIds.includes(entry.locationReference))
        : viewer.role === "front_desk" || viewer.role === "commission_barber" || viewer.role === "booth_rent_barber" || viewer.role === "client"
          ? []
          : snapshot.ownerAnalytics
  };
}

export function bookAppointmentInSnapshot(snapshot: LiveOperationsSnapshot, input: BookingMutationInput): LiveMutationSuccess {
  const service = getService(input.serviceId);
  const barber = getBarber(input.barberId);
  const addOns = input.addOnIds.map((id) => getService(id)).filter(Boolean) as Service[];
  const quote = input.pricingSnapshot ?? (() => {
    if (!service) {
      throw new Error(`Service ${input.serviceId} was not found.`);
    }
    if (!barber) {
      throw new Error(`Barber ${input.barberId} was not found.`);
    }
    const calculated = calculateBookingQuote(service, addOns);
    return {
      serviceTotal: service.price,
      addOnTotal: addOns.reduce((sum, addOn) => sum + addOn.price, 0),
      subtotal: calculated.subtotal,
      discountTotal: 0,
      taxTotal: 0,
      tipTotal: 0,
      grandTotal: calculated.subtotal,
      depositDue: calculated.depositDue,
      balanceDue: Math.max(calculated.subtotal - calculated.depositDue, 0),
      totalDurationMinutes: calculated.totalDuration
    } satisfies AppointmentFinancialQuote;
  })();
  const now = new Date().toISOString();
  const existingClient = snapshot.clients.find(
    (client) => normalizePhone(client.phone) === normalizePhone(input.clientPhone) || client.name.toLowerCase() === input.clientName.toLowerCase()
  );
  const clientId = input.clientId ?? existingClient?.id ?? createId("client");
  const start = new Date(input.appointmentTime);
  const end = new Date(start.getTime() + quote.totalDurationMinutes * 60 * 1000);
  assertBookingAvailability(snapshot, input, end.toISOString());
  const appointment: LiveAppointmentRecord = {
    id: createId("appt"),
    locationId: input.locationId,
    shopId: input.locationId,
    barberId: input.barberId,
    clientId,
    serviceId: input.serviceId,
    confirmationCode: input.confirmationCode,
    status: "booked",
    start: start.toISOString(),
    end: end.toISOString(),
    chair: "Front desk assign",
    addOnIds: input.addOnIds,
    depositAmount: quote.depositDue,
    serviceTotal: quote.serviceTotal,
    addOnTotal: quote.addOnTotal,
    subtotal: quote.subtotal,
    discountTotal: quote.discountTotal,
    taxTotal: quote.taxTotal,
    totalAmount: Math.max(quote.grandTotal - quote.tipTotal, 0),
    grandTotal: quote.grandTotal,
    balanceDue: quote.balanceDue,
    tipAmount: quote.tipTotal,
    note: "Booked from client flow",
    internalNotes: input.internalNotes,
    bookingSource: input.bookingSource ?? "booking",
    membershipId: input.membershipId,
    createdBy: input.createdBy,
    source: input.source ?? (input.actorRole === "owner" || input.actorRole === "manager" || input.actorRole === "front_desk" ? "front_desk" : "booking"),
    checkedInAt: undefined,
    serviceStartedAt: undefined,
    completedAt: undefined,
    cancelledAt: undefined,
    cancellationReason: undefined,
    revision: 1,
    updatedAt: now,
    lastActorRole: input.actorRole ?? "client",
    lastEventType: "booking"
  };

  const nextClients = existingClient
    ? snapshot.clients
    : [
        ...snapshot.clients,
        {
          id: clientId,
          name: input.clientName,
          phone: input.clientPhone,
          email: `${slugify(input.clientName)}@guest.bvrb3r.local`,
          loyaltyPoints: 0,
          retentionTag: "new" as const,
          notes: ["Created from client booking flow"]
        } satisfies Client
      ];

  const activity = createMutationActivity(appointment, input.actorRole ?? "client", "booking", now);
  const nextSnapshot = applyPersistenceArtifacts(
    {
      ...snapshot,
      fetchedAt: now,
      clients: nextClients,
      appointments: sortAppointments([appointment, ...snapshot.appointments])
    },
    appointment,
    activity
  );

  return {
    appointment,
    snapshot: nextSnapshot
  };
}

export function transitionAppointmentInSnapshot(
  snapshot: LiveOperationsSnapshot,
  input: AppointmentLifecycleMutationInput
): LiveMutationSuccess {
  const appointment = snapshot.appointments.find((entry) => entry.id === input.appointmentId);
  if (!appointment) {
    throw new Error(`Appointment ${input.appointmentId} was not found.`);
  }

  assertRevision(appointment, input.expectedRevision);
  assertStatusTransition(appointment, input.action);

  const now = new Date().toISOString();
  const nextStatus = nextStatusForAction(input.action);
  const closesTicket = input.action === "service_complete";
  const lifecycleFields = buildAppointmentLifecycleFields(
    {
      checkedInAt: appointment.checkedInAt ?? null,
      serviceStartedAt: appointment.serviceStartedAt ?? null,
      completedAt: appointment.completedAt ?? null,
      cancelledAt: appointment.cancelledAt ?? null,
      cancellationReason: appointment.cancellationReason ?? null
    },
    nextStatus,
    now
  );
  const nextAppointment: LiveAppointmentRecord = {
    ...appointment,
    status: nextStatus,
    balanceDue: closesTicket ? 0 : appointment.balanceDue,
    checkedInAt: lifecycleFields.checkedInAt ?? undefined,
    serviceStartedAt: lifecycleFields.serviceStartedAt ?? undefined,
    completedAt: lifecycleFields.completedAt ?? undefined,
    cancelledAt: lifecycleFields.cancelledAt ?? undefined,
    cancellationReason: lifecycleFields.cancellationReason ?? undefined,
    revision: appointment.revision + 1,
    updatedAt: now,
    note:
      input.action === "check_in"
        ? "Checked in at front desk"
        : input.action === "service_start"
          ? "Barber started service"
          : "Service completed and posted",
    lastActorRole: input.actorRole,
    lastEventType:
      input.action === "check_in"
        ? "check_in"
        : input.action === "service_start"
          ? "service_start"
          : "service_complete"
  };
  const activity = createMutationActivity(nextAppointment, input.actorRole, input.action, now);
  const nextSnapshot = applyPersistenceArtifacts(
    {
      ...snapshot,
      fetchedAt: now,
      appointments: sortAppointments(
        snapshot.appointments.map((entry) => (entry.id === nextAppointment.id ? nextAppointment : entry))
      )
    },
    nextAppointment,
    activity
  );

  return {
    appointment: nextAppointment,
    snapshot: nextSnapshot
  };
}

export function checkoutAppointmentInSnapshot(snapshot: LiveOperationsSnapshot, input: CheckoutMutationInput): LiveMutationSuccess {
  const appointment = snapshot.appointments.find((entry) => entry.id === input.appointmentId);
  if (!appointment) {
    throw new Error(`Appointment ${input.appointmentId} was not found.`);
  }

  assertRevision(appointment, input.expectedRevision);
  if (appointment.status !== "completed") {
    throw new LiveOperationConflictError(
      `Appointment ${appointment.id} must be completed before checkout.`,
      appointment,
      "invalid_transition"
    );
  }

  const now = new Date().toISOString();
  const amountCollected = Math.max(appointment.balanceDue, 0);
  const checkoutReference = createId("checkout");
  const nextAppointment: LiveAppointmentRecord = {
    ...appointment,
    balanceDue: 0,
    tipAmount: input.tipAmount,
    grandTotal: (appointment.subtotal ?? appointment.totalAmount) - (appointment.discountTotal ?? 0) + (appointment.taxTotal ?? 0) + input.tipAmount,
    revision: appointment.revision + 1,
    updatedAt: now,
    note: "Checked out and paid",
    checkoutReference,
    lastActorRole: input.actorRole,
    lastEventType: "checkout"
  };
  const checkoutRecord: CheckoutRecord = {
    id: checkoutReference,
    appointmentId: nextAppointment.id,
    locationId: nextAppointment.locationId,
    barberId: nextAppointment.barberId,
    clientId: nextAppointment.clientId,
    amountCollected,
    tipAmount: input.tipAmount,
    paymentMethod: input.paymentMethod,
    provider: "mock",
    collectedAt: now
  };
  const activity = createMutationActivity(nextAppointment, input.actorRole, "checkout", now, amountCollected, input.tipAmount);
  const nextSnapshot = applyPersistenceArtifacts(
    {
      ...snapshot,
      fetchedAt: now,
      appointments: sortAppointments(
        snapshot.appointments.map((entry) => (entry.id === nextAppointment.id ? nextAppointment : entry))
      )
    },
    nextAppointment,
    activity,
    checkoutRecord
  );

  return {
    appointment: nextAppointment,
    snapshot: nextSnapshot
  };
}
export function cancelAppointmentInSnapshot(snapshot: LiveOperationsSnapshot, input: CancelAppointmentMutationInput): LiveMutationSuccess {
  const appointment = snapshot.appointments.find((entry) => entry.id === input.appointmentId);
  if (!appointment) {
    throw new Error(`Appointment ${input.appointmentId} was not found.`);
  }

  assertRevision(appointment, input.expectedRevision);
  assertCancelable(appointment);

  const now = new Date().toISOString();
  const lifecycleFields = buildAppointmentLifecycleFields(
    {
      checkedInAt: appointment.checkedInAt ?? null,
      serviceStartedAt: appointment.serviceStartedAt ?? null,
      completedAt: appointment.completedAt ?? null,
      cancelledAt: appointment.cancelledAt ?? null,
      cancellationReason: appointment.cancellationReason ?? null
    },
    "cancelled",
    now,
    input.reason
  );
  const nextAppointment: LiveAppointmentRecord = {
    ...appointment,
    status: "cancelled",
    cancelledAt: lifecycleFields.cancelledAt ?? undefined,
    cancellationReason: lifecycleFields.cancellationReason ?? undefined,
    revision: appointment.revision + 1,
    updatedAt: now,
    note: input.reason ? `Appointment cancelled: ${input.reason}` : "Appointment cancelled before service began",
    lastActorRole: input.actorRole,
    lastEventType: "cancel"
  };
  const activity = createMutationActivity(nextAppointment, input.actorRole, "cancel", now);
  const nextSnapshot = applyPersistenceArtifacts(
    {
      ...snapshot,
      fetchedAt: now,
      appointments: sortAppointments(
        snapshot.appointments.map((entry) => (entry.id === nextAppointment.id ? nextAppointment : entry))
      )
    },
    nextAppointment,
    activity
  );

  return {
    appointment: nextAppointment,
    snapshot: nextSnapshot
  };
}

