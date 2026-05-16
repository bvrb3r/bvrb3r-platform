import { boothRentLedger, demoBarbers, demoClients, demoLocations, demoServices } from "@/lib/data/demo";
import { isScheduledAppointmentStatus, isUpcomingAppointmentStatus } from "@/lib/appointments/domain";
import { Appointment, Barber, BoothRentLedgerEntry, Client, Location, RevenuePoint, Service } from "@/types/domain";

export interface CheckoutRecord {
  id: string;
  appointmentId: string;
  locationId: string;
  barberId: string;
  clientId: string;
  amountCollected: number;
  tipAmount: number;
  paymentMethod: "card_on_file" | "tap_to_pay";
  provider: "mock" | "stripe";
  collectedAt: string;
}

export interface FlowActivity {
  id: string;
  appointmentId: string;
  type: "booking" | "reschedule" | "check_in" | "service_start" | "service_complete" | "checkout" | "cancel" | "no_show";
  actorRole: string;
  title: string;
  detail: string;
  createdAt: string;
}

export interface AppointmentViewModel {
  appointment: Appointment;
  client: Client | undefined;
  barber: Barber | undefined;
  service: Service | undefined;
  location: Location | undefined;
}

const weekdayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toIsoDateKey(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

function formatWeekday(iso: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(iso));
}

export function getBusinessDateKey(appointments: Appointment[]) {
  if (!appointments.length) {
    return new Date().toISOString().slice(0, 10);
  }

  return [...appointments]
    .sort((left, right) => new Date(right.start).getTime() - new Date(left.start).getTime())[0]
    .start.slice(0, 10);
}

export function isOnBusinessDate(iso: string, businessDateKey: string) {
  return toIsoDateKey(iso) === businessDateKey;
}

export function isAppointmentPaid(appointment: Appointment) {
  return appointment.status === "completed" && appointment.balanceDue <= 0;
}

export function isReadyForCheckout(appointment: Appointment) {
  return appointment.status === "completed" && appointment.balanceDue > 0;
}

export function getAppointmentViewModel(appointment: Appointment, clients: Client[] = demoClients): AppointmentViewModel {
  return {
    appointment,
    client: clients.find((entry) => entry.id === appointment.clientId),
    barber: demoBarbers.find((entry) => entry.id === appointment.barberId),
    service: demoServices.find((entry) => entry.id === appointment.serviceId),
    location: demoLocations.find((entry) => entry.id === appointment.locationId)
  };
}

export function buildOwnerRevenueSeries(appointments: Appointment[]): RevenuePoint[] {
  const totals = new Map<string, RevenuePoint>(weekdayOrder.map((label) => [label, { label, revenue: 0, appointments: 0 }]));

  appointments.filter(isAppointmentPaid).forEach((appointment) => {
    const label = formatWeekday(appointment.start);
    const current = totals.get(label);
    if (!current) {
      return;
    }

    current.revenue += appointment.totalAmount;
    current.appointments += 1;
  });

  return weekdayOrder.map((label) => totals.get(label) ?? { label, revenue: 0, appointments: 0 });
}

export function getOwnerFlowMetrics(appointments: Appointment[]) {
  const businessDateKey = getBusinessDateKey(appointments);
  const paidToday = appointments.filter((appointment) => isAppointmentPaid(appointment) && isOnBusinessDate(appointment.start, businessDateKey));
  const completedToday = appointments.filter((appointment) => appointment.status === "completed" && isOnBusinessDate(appointment.start, businessDateKey));
  const bookedToday = appointments.filter((appointment) => isScheduledAppointmentStatus(appointment.status) && isOnBusinessDate(appointment.start, businessDateKey));
  const outstandingBalance = appointments
    .filter((appointment) => appointment.status !== "cancelled" && appointment.status !== "no_show")
    .reduce((sum, appointment) => sum + Math.max(appointment.balanceDue, 0), 0);

  return {
    businessDateKey,
    revenueToday: paidToday.reduce((sum, appointment) => sum + appointment.totalAmount, 0),
    tipsToday: paidToday.reduce((sum, appointment) => sum + appointment.tipAmount, 0),
    completedServicesToday: completedToday.length,
    bookedToday: bookedToday.length,
    outstandingBalance
  };
}

export function getBarberFlowMetrics(barber: Barber, appointments: Appointment[], rentEntries: BoothRentLedgerEntry[] = boothRentLedger) {
  const businessDateKey = getBusinessDateKey(appointments);
  const barberAppointments = appointments.filter((appointment) => appointment.barberId === barber.id);
  const paidToday = barberAppointments.filter((appointment) => isAppointmentPaid(appointment) && isOnBusinessDate(appointment.start, businessDateKey));
  const activeCount = barberAppointments.filter((appointment) => isUpcomingAppointmentStatus(appointment.status)).length;
  const serviceRevenueToday = paidToday.reduce((sum, appointment) => sum + appointment.totalAmount, 0);
  const tipsToday = paidToday.reduce((sum, appointment) => sum + appointment.tipAmount, 0);
  const nextRent = rentEntries
    .filter((entry) => entry.barberId === barber.id && entry.status !== "paid")
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0];

  if (barber.compensationModel === "commission") {
    const commissionToday = paidToday.reduce((sum, appointment) => sum + appointment.totalAmount * (barber.commissionRate ?? 0) + appointment.tipAmount, 0);
    const projectedPayout = barberAppointments
      .filter(isAppointmentPaid)
      .reduce((sum, appointment) => sum + appointment.totalAmount * (barber.commissionRate ?? 0) + appointment.tipAmount, 0);

    return {
      businessDateKey,
      activeCount,
      serviceRevenueToday,
      tipsToday,
      commissionToday,
      projectedPayout,
      nextRent,
      completedPaidCount: paidToday.length
    };
  }

  return {
    businessDateKey,
    activeCount,
    serviceRevenueToday,
    tipsToday,
    commissionToday: 0,
    projectedPayout: 0,
    nextRent,
    completedPaidCount: paidToday.length,
    rentCoverageToday: serviceRevenueToday - (nextRent?.amount ?? 0)
  };
}
