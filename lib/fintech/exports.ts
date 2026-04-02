import { readBookingTransactionBreakdown } from "@/lib/fintech/breakdown";
import { buildTaxSummary } from "@/lib/fintech/tax";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";
import { listPayoutQueue } from "@/lib/payments/service";
import { readPointsStateSnapshot } from "@/lib/points/engine";
import type { UserAccount } from "@/types/domain";

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function getYearBounds(year: number) {
  return {
    start: `${year}-01-01T00:00:00.000Z`,
    end: `${year}-12-31T23:59:59.999Z`
  };
}

function isInRange(value: string | null | undefined, start: string, end: string) {
  if (!value) {
    return false;
  }

  return value >= start && value <= end;
}

async function readScopedSnapshot(user: UserAccount) {
  const provider = await getLiveOperationsProvider();
  return provider.readSnapshot({
    role: user.role,
    email: user.email,
    clientId: user.clientId,
    barberId: user.barberId,
    locationIds: user.locationIds
  });
}

export async function readFintechTaxSummaryExport(input: {
  user: UserAccount;
  year: number;
}) {
  const snapshot = await readScopedSnapshot(input.user);

  if (input.user.role === "commission_barber" || input.user.role === "booth_rent_barber") {
    return buildTaxSummary({
      role: "barber",
      subjectId: input.user.barberId ?? input.user.id,
      userId: input.user.id,
      year: input.year,
      appointments: snapshot.appointments.filter((appointment) => appointment.barberId === input.user.barberId)
    });
  }

  return buildTaxSummary({
    role: input.user.role === "owner" ? "owner" : "shop",
    subjectId: input.user.role === "owner" ? input.user.id : input.user.locationIds[0] ?? input.user.id,
    year: input.year,
    appointments: snapshot.appointments,
    userId: input.user.id
  });
}

export async function readPayoutExport(input: {
  user: UserAccount;
  year: number;
}) {
  const { start, end } = getYearBounds(input.year);
  const snapshot = await readScopedSnapshot(input.user);
  const appointmentIds = new Set(
    snapshot.appointments
      .filter((appointment) =>
        isInRange(appointment.completedAt ?? appointment.updatedAt, start, end)
        && (
          !(input.user.role === "commission_barber" || input.user.role === "booth_rent_barber")
          || appointment.barberId === input.user.barberId
        )
      )
      .map((appointment) => appointment.id)
  );
  const queue = await listPayoutQueue({
    locationIds: input.user.role === "owner" || input.user.role === "manager" ? input.user.locationIds : undefined
  }).catch(() => []);
  const rows = queue.filter((entry) => entry.appointmentId && appointmentIds.has(entry.appointmentId));

  return {
    summary: {
      pendingAmount: roundCurrency(rows.filter((row) => row.status === "pending").reduce((sum, row) => sum + row.eligibleAmount, 0)),
      queuedAmount: roundCurrency(rows.filter((row) => row.status === "queued").reduce((sum, row) => sum + row.eligibleAmount, 0)),
      inTransitAmount: roundCurrency(rows.filter((row) => row.status === "in_transit").reduce((sum, row) => sum + row.eligibleAmount, 0)),
      paidAmount: roundCurrency(rows.filter((row) => row.status === "paid").reduce((sum, row) => sum + row.eligibleAmount, 0)),
      failedAmount: roundCurrency(rows.filter((row) => row.status === "failed").reduce((sum, row) => sum + row.eligibleAmount, 0)),
      reversedAmount: roundCurrency(rows.filter((row) => row.status === "reversed").reduce((sum, row) => sum + row.eligibleAmount, 0))
    },
    rows
  };
}

export async function readRevenueExport(input: {
  user: UserAccount;
  year: number;
}) {
  const { start, end } = getYearBounds(input.year);
  const snapshot = await readScopedSnapshot(input.user);
  const scopedAppointments = snapshot.appointments.filter((appointment) =>
    isInRange(appointment.start, start, end)
    && !(input.user.role === "commission_barber" || input.user.role === "booth_rent_barber")
  );
  const rows = await Promise.all(scopedAppointments.map(async (appointment) => {
    const breakdown = await readBookingTransactionBreakdown(appointment.id).catch(() => null);
    return {
      appointmentId: appointment.id,
      clientId: appointment.clientId,
      barberId: appointment.barberId,
      locationId: appointment.locationId,
      status: appointment.status,
      start: appointment.start,
      breakdown
    };
  }));

  return {
    summary: {
      grossRevenue: roundCurrency(rows.reduce((sum, row) => sum + (row.breakdown?.gross ?? 0), 0)),
      netRevenue: roundCurrency(rows.reduce((sum, row) => sum + (row.breakdown?.net ?? 0), 0)),
      platformFees: roundCurrency(rows.reduce((sum, row) => sum + (row.breakdown?.platformFee ?? 0), 0)),
      processorFees: roundCurrency(rows.reduce((sum, row) => sum + (row.breakdown?.processorFee ?? 0), 0)),
      barberEarnings: roundCurrency(rows.reduce((sum, row) => sum + (row.breakdown?.barberEarnings ?? 0), 0)),
      shopEarnings: roundCurrency(rows.reduce((sum, row) => sum + (row.breakdown?.shopEarnings ?? 0), 0))
    },
    rows
  };
}

export async function readIncentivesExport(input: {
  user: UserAccount;
  year: number;
}) {
  const { start, end } = getYearBounds(input.year);
  const pointsState = await readPointsStateSnapshot();
  const transactions = pointsState.transactions.filter((transaction) =>
    isInRange(transaction.createdAt, start, end)
    && (
      input.user.role === "owner"
      || input.user.role === "manager"
      || transaction.userId === input.user.id
    )
  );
  const cashoutRequests = pointsState.cashoutRequests.filter((request) =>
    isInRange(request.createdAt, start, end)
    && (
      input.user.role === "owner"
      || input.user.role === "manager"
      || request.userId === input.user.id
    )
  );

  return {
    summary: {
      issuedInAppValue: roundCurrency(transactions.filter((transaction) => transaction.pointsDelta > 0).reduce((sum, transaction) => sum + transaction.inAppValue, 0)),
      redeemedInAppValue: roundCurrency(Math.abs(transactions.filter((transaction) => transaction.status === "redeemed").reduce((sum, transaction) => sum + transaction.inAppValue, 0))),
      cashedOutValue: roundCurrency(Math.abs(transactions.filter((transaction) => transaction.status === "cashed_out").reduce((sum, transaction) => sum + transaction.cashValue, 0))),
      pendingUnlockValue: roundCurrency(transactions.filter((transaction) => transaction.status === "pending").reduce((sum, transaction) => sum + transaction.inAppValue, 0))
    },
    transactions,
    cashoutRequests
  };
}
