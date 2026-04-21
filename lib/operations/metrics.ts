import { isUpcomingAppointmentStatus } from "@/lib/appointments/domain";
import { CompensationSnapshotRecord, OwnerAnalyticsSnapshotRecord } from "@/lib/operations/persistence";
import { LiveAppointmentRecord } from "@/lib/operations/live-state";
import { RevenuePoint } from "@/types/domain";

function dateKey(iso: string) {
  return iso.slice(0, 10);
}

function weekdayLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(`${date}T12:00:00Z`));
}

function getOwnerAppointmentPriority(status: LiveAppointmentRecord["status"]) {
  switch (status) {
    case "in_service":
      return 0;
    case "checked_in":
      return 1;
    case "confirmed":
      return 2;
    case "booked":
      return 2;
    case "completed":
      return 3;
    case "cancelled":
      return 4;
    default:
      return 5;
  }
}

export function getLatestBusinessDate(rows: OwnerAnalyticsSnapshotRecord[], appointments: LiveAppointmentRecord[], compensationRows: CompensationSnapshotRecord[] = []) {
  const candidates = [
    ...rows.map((entry) => entry.businessDate),
    ...appointments.map((entry) => dateKey(entry.start)),
    ...compensationRows.map((entry) => entry.businessDate)
  ].sort((left, right) => right.localeCompare(left));

  return candidates[0] ?? new Date().toISOString().slice(0, 10);
}

export function getOwnerAnalyticsSummary(rows: OwnerAnalyticsSnapshotRecord[]) {
  const businessDate = getLatestBusinessDate(rows, []);
  const activeRows = rows.filter((entry) => entry.businessDate === businessDate);

  return {
    businessDate,
    revenueToday: activeRows.reduce((sum, entry) => sum + entry.revenueTotal, 0),
    tipsToday: activeRows.reduce((sum, entry) => sum + entry.tipTotal, 0),
    outstandingBalance: activeRows.reduce((sum, entry) => sum + entry.outstandingBalance, 0),
    completedServicesToday: activeRows.reduce((sum, entry) => sum + entry.completedServicesCount, 0),
    bookedToday: activeRows.reduce((sum, entry) => sum + entry.bookedCount, 0),
    paidAppointmentsToday: activeRows.reduce((sum, entry) => sum + entry.paidAppointmentsCount, 0)
  };
}

export function buildOwnerRevenueSeriesFromAnalytics(rows: OwnerAnalyticsSnapshotRecord[]): RevenuePoint[] {
  const totals = new Map<string, RevenuePoint>();

  for (const row of rows) {
    const existing = totals.get(row.businessDate);
    if (existing) {
      existing.revenue += row.revenueTotal;
      existing.appointments += row.completedServicesCount;
      continue;
    }

    totals.set(row.businessDate, {
      label: weekdayLabel(row.businessDate),
      revenue: row.revenueTotal,
      appointments: row.completedServicesCount
    });
  }

  return [...totals.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .slice(-7)
    .map((entry) => entry[1]);
}

export function sortOwnerDashboardAppointments<T extends LiveAppointmentRecord>(appointments: T[], businessDate: string) {
  return appointments
    .filter((appointment) => appointment.start.slice(0, 10) === businessDate)
    .sort((left, right) => {
      const priority = getOwnerAppointmentPriority(left.status) - getOwnerAppointmentPriority(right.status);
      if (priority !== 0) {
        return priority;
      }

      return new Date(left.start).getTime() - new Date(right.start).getTime();
    });
}

export function getBarberCompensationSummary(barberId: string, appointments: LiveAppointmentRecord[], rows: CompensationSnapshotRecord[]) {
  const businessDate = getLatestBusinessDate([], appointments.filter((entry) => entry.barberId === barberId), rows.filter((entry) => entry.barberReference === barberId));
  const barberRows = rows.filter((entry) => entry.barberReference === barberId);
  const todayRows = barberRows.filter((entry) => entry.businessDate === businessDate);
  const activeCount = appointments.filter(
    (entry) => entry.barberId === barberId && isUpcomingAppointmentStatus(entry.status)
  ).length;

  return {
    businessDate,
    activeCount,
    serviceRevenueToday: todayRows.reduce((sum, entry) => sum + entry.grossServiceAmount, 0),
    tipsToday: todayRows.reduce((sum, entry) => sum + entry.tipAmount, 0),
    commissionToday: todayRows.reduce((sum, entry) => sum + entry.commissionAmount, 0),
    projectedPayout: barberRows.reduce((sum, entry) => sum + entry.commissionAmount, 0),
    nextRent: undefined,
    completedPaidCount: todayRows.length,
    rentCoverageToday: todayRows.reduce((sum, entry) => sum + (entry.rentCoverageAmount ?? 0), 0)
  };
}

export function getManagerOperationsSummary(
  appointments: LiveAppointmentRecord[],
  ownerAnalytics: OwnerAnalyticsSnapshotRecord[],
  walkIns: Array<{ waitMinutes: number }>
) {
  const latestDate = getLatestBusinessDate(ownerAnalytics, appointments);
  const activeAppointments = appointments.filter((entry) => entry.start.slice(0, 10) === latestDate);
  const analyticsRows = ownerAnalytics.filter((entry) => entry.businessDate === latestDate);
  const queueAvg = walkIns.length ? Math.round(walkIns.reduce((sum, entry) => sum + entry.waitMinutes, 0) / walkIns.length) : 0;

  return {
    latestDate,
    checkedInCount: activeAppointments.filter((entry) => entry.status === "checked_in").length,
    inServiceCount: activeAppointments.filter((entry) => entry.status === "in_service").length,
    readyForCheckoutCount: activeAppointments.filter((entry) => entry.status === "completed" && entry.balanceDue > 0).length,
    completedCount: analyticsRows.reduce((sum, entry) => sum + entry.completedServicesCount, 0),
    revenueToday: analyticsRows.reduce((sum, entry) => sum + entry.revenueTotal, 0),
    queueAverageMinutes: queueAvg
  };
}
