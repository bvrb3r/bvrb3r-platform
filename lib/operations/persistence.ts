import type { Appointment, Barber, Client } from "@/types/domain";
import { CheckoutRecord, FlowActivity, getOwnerFlowMetrics, isAppointmentPaid } from "@/lib/utils/operations";
import { calculateAutoBoothRentApplication } from "@/lib/fintech/booth-rent-doctrine";

export type WorkflowPersistenceBarber = Pick<
  Barber,
  "id" | "compensationModel" | "autoBoothPercent" | "boothRentAmount" | "boothRentFrequency"
> & {
  userId: string;
  email?: string | null;
  /**
   * Outstanding booth rent for the current period. When omitted, the periodic
   * rent amount bounds the application, so AutoBooth still can never apply more
   * than the barber could possibly owe for the period.
   */
  outstandingRentAmount?: number | null;
};

export interface WorkflowEventRecord {
  appointmentReference: string;
  locationReference: string;
  barberReference: string;
  barberUserReference: string;
  barberEmail: string;
  clientReference: string;
  clientEmail: string;
  actorRole: string;
  eventType: FlowActivity["type"];
  title: string;
  detail: string;
  eventPayload: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface CompensationSnapshotRecord {
  appointmentReference: string;
  locationReference: string;
  barberReference: string;
  barberUserReference: string;
  barberEmail: string;
  clientReference: string;
  clientEmail: string;
  compensationModel: Barber["compensationModel"];
  businessDate: string;
  grossServiceAmount: number;
  depositAmount: number;
  collectedAmount: number;
  tipAmount: number;
  /** Owner-approved AutoBooth portion (0..1) in force at capture time. */
  autoBoothPercent: number | null;
  /** Rent settled by AutoBooth for this transaction. Never exceeds rent owed. */
  autoBoothRentAppliedAmount: number;
  boothRentAmount: number | null;
  boothRentPeriodLabel: string | null;
  rentCoverageAmount: number | null;
  checkoutReference: string | null;
  capturedAt: string;
}

export interface OwnerAnalyticsSnapshotRecord {
  locationReference: string;
  businessDate: string;
  bookedCount: number;
  completedServicesCount: number;
  paidAppointmentsCount: number;
  revenueTotal: number;
  tipTotal: number;
  outstandingBalance: number;
  updatedAt: string;
}

export interface WorkflowPersistenceEnvelope {
  workflowEvent: WorkflowEventRecord;
  compensationSnapshot: CompensationSnapshotRecord | null;
  ownerAnalyticsSnapshot: OwnerAnalyticsSnapshotRecord;
}

interface WorkflowPersistenceInput {
  appointment: Appointment;
  appointments: Appointment[];
  barber: WorkflowPersistenceBarber;
  client?: Client;
  latestActivity: FlowActivity;
  checkout?: CheckoutRecord;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function getBarberEmail(barber: WorkflowPersistenceBarber) {
  return barber.email ?? "";
}

function getClientEmail(client: Client | undefined, fallbackClientId: string) {
  return client?.email ?? fallbackClientId;
}

export function buildWorkflowEventRecord({ appointment, barber, client, latestActivity }: WorkflowPersistenceInput): WorkflowEventRecord {
  return {
    appointmentReference: appointment.id,
    locationReference: appointment.locationId,
    barberReference: appointment.barberId,
    barberUserReference: barber.userId,
    barberEmail: getBarberEmail(barber),
    clientReference: client?.id ?? appointment.clientId,
    clientEmail: getClientEmail(client, appointment.clientId),
    actorRole: latestActivity.actorRole,
    eventType: latestActivity.type,
    title: latestActivity.title,
    detail: latestActivity.detail,
    eventPayload: {
      appointmentStatus: appointment.status,
      source: appointment.source,
      balanceDue: appointment.balanceDue,
      totalAmount: appointment.totalAmount,
      tipAmount: appointment.tipAmount,
      hasCheckout: Boolean(latestActivity.type === "checkout")
    },
    createdAt: latestActivity.createdAt
  };
}

export function buildCompensationSnapshot({ appointment, barber, client, checkout }: WorkflowPersistenceInput): CompensationSnapshotRecord | null {
  if (!checkout && !isAppointmentPaid(appointment)) {
    return null;
  }

  const tipAmount = checkout?.tipAmount ?? appointment.tipAmount;
  const isRentModel = barber.compensationModel === "booth_rent"
    || barber.compensationModel === "autobooth_rent";

  // Tips are never eligible for rent application, so only service money can
  // retire rent. The shared doctrine engine enforces the outstanding-rent cap.
  const outstandingRentCents = Math.round(
    Math.max(barber.outstandingRentAmount ?? barber.boothRentAmount ?? 0, 0) * 100
  );
  const autoBoothApplication = calculateAutoBoothRentApplication({
    model: barber.compensationModel === "autobooth_rent" ? "autobooth_rent" : "booth_rent",
    autoBoothPercent: barber.autoBoothPercent ?? null,
    eligibleProceedsCents: Math.round(Math.max(appointment.totalAmount, 0) * 100),
    outstandingRentCents,
    paymentStatus: "captured"
  });
  const autoBoothRentAppliedAmount = roundCurrency(autoBoothApplication.appliedToRentCents / 100);

  const boothRentAmount = isRentModel ? barber.boothRentAmount ?? null : null;
  const rentCoverageAmount = isRentModel
    ? (boothRentAmount === null ? null : roundCurrency(appointment.totalAmount + tipAmount - boothRentAmount))
    : null;

  return {
    appointmentReference: appointment.id,
    locationReference: appointment.locationId,
    barberReference: appointment.barberId,
    barberUserReference: barber.userId,
    barberEmail: getBarberEmail(barber),
    clientReference: client?.id ?? appointment.clientId,
    clientEmail: getClientEmail(client, appointment.clientId),
    compensationModel: barber.compensationModel,
    businessDate: appointment.start.slice(0, 10),
    grossServiceAmount: appointment.totalAmount,
    depositAmount: appointment.depositAmount,
    collectedAmount: checkout?.amountCollected ?? roundCurrency(Math.max(appointment.totalAmount - appointment.depositAmount, 0)),
    tipAmount,
    autoBoothPercent: barber.compensationModel === "autobooth_rent" ? barber.autoBoothPercent ?? null : null,
    autoBoothRentAppliedAmount,
    boothRentAmount,
    boothRentPeriodLabel: isRentModel ? barber.boothRentFrequency ?? null : null,
    rentCoverageAmount,
    checkoutReference: checkout?.id ?? null,
    capturedAt: checkout?.collectedAt ?? new Date().toISOString()
  };
}

export function buildOwnerAnalyticsSnapshot(locationReference: string, appointments: Appointment[]): OwnerAnalyticsSnapshotRecord {
  const locationAppointments = appointments.filter((appointment) => appointment.locationId === locationReference);
  const metrics = getOwnerFlowMetrics(locationAppointments);
  const paidAppointmentsCount = locationAppointments.filter(
    (appointment) => isAppointmentPaid(appointment) && appointment.start.slice(0, 10) === metrics.businessDateKey
  ).length;

  return {
    locationReference,
    businessDate: metrics.businessDateKey,
    bookedCount: metrics.bookedToday,
    completedServicesCount: metrics.completedServicesToday,
    paidAppointmentsCount,
    revenueTotal: metrics.revenueToday,
    tipTotal: metrics.tipsToday,
    outstandingBalance: metrics.outstandingBalance,
    updatedAt: new Date().toISOString()
  };
}

export function buildWorkflowPersistenceEnvelope(input: WorkflowPersistenceInput): WorkflowPersistenceEnvelope {
  return {
    workflowEvent: buildWorkflowEventRecord(input),
    compensationSnapshot: buildCompensationSnapshot(input),
    ownerAnalyticsSnapshot: buildOwnerAnalyticsSnapshot(input.appointment.locationId, input.appointments)
  };
}
