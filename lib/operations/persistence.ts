import type { Appointment, Barber, Client } from "@/types/domain";
import { CheckoutRecord, FlowActivity, getOwnerFlowMetrics, isAppointmentPaid } from "@/lib/utils/operations";

export type WorkflowPersistenceBarber = Pick<
  Barber,
  "id" | "compensationModel" | "commissionRate" | "boothRentAmount" | "boothRentFrequency"
> & {
  userId: string;
  email?: string | null;
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
  commissionRate: number | null;
  commissionAmount: number;
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
  const commissionAmount = barber.compensationModel === "commission"
    ? roundCurrency(appointment.totalAmount * (barber.commissionRate ?? 0) + tipAmount)
    : 0;
  const boothRentAmount = barber.compensationModel === "booth_rent"
    ? barber.boothRentAmount ?? null
    : null;
  const rentCoverageAmount = barber.compensationModel === "booth_rent"
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
    commissionRate: barber.compensationModel === "commission" ? barber.commissionRate ?? null : null,
    commissionAmount,
    boothRentAmount,
    boothRentPeriodLabel: barber.compensationModel === "booth_rent" ? barber.boothRentFrequency ?? null : null,
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
