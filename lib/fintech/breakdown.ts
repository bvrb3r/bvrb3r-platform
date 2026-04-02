import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import {
  canonicalAppointmentUuid,
  canonicalBarberUuid,
  canonicalLocationUuid,
  readCanonicalOperationsSnapshot
} from "@/lib/booking/canonical-booking";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";
import {
  readAppointmentPaymentSummary,
  readAppointmentPayoutVisibility,
  type AppointmentPaymentSummaryView
} from "@/lib/payments/service";
import { readPointsStateSnapshot } from "@/lib/points/engine";
import type { LiveAppointmentRecord, LiveOperationsViewer } from "@/lib/operations/live-state";
import type {
  BookingTransactionBreakdownView,
  PayoutVisibilityView
} from "@/types/fintech";
import type { PointsTransactionRecord } from "@/types/points";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type AppointmentRow = {
  id: string;
  created_at: string;
};

type PaymentRow = {
  id: string;
  appointment_id: string | null;
  payment_status: string;
  payment_type: string;
  provider: string | null;
  amount: number | string;
  currency: string;
  paid_at: string | null;
  created_at: string;
};

type RefundRow = {
  id: string;
  payment_id: string;
  amount: number | string;
  refunded_at: string;
};

type RoutingRow = {
  id: string;
  payment_id: string;
  appointment_id: string | null;
  platform_fee_amount: number | string;
  provider_fee_amount: number | string;
  barber_payout_amount: number | string;
  shop_split_amount: number | string;
  payout_readiness_status: string;
  money_routing_status: string;
  blocked_reason: string | null;
  reconciliation_status: string;
  updated_at: string;
};

type ExecutionRow = {
  id: string;
  payment_id: string;
  appointment_id: string | null;
  amount: number | string;
  execution_status: string;
  failure_reason: string | null;
  blocked_reason: string | null;
  processor_transfer_id: string | null;
  reconciliation_status: string;
  executed_at: string | null;
  failed_at: string | null;
  reversed_at: string | null;
  created_at: string;
  updated_at: string;
};

type BarberRow = {
  id: string;
  reference_code: string | null;
  profile_id: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string;
};

type LocationRow = {
  id: string;
  reference_code: string | null;
  name: string;
  neighborhood: string;
  city: string;
};

export type AppointmentFinancialContext = {
  appointment: LiveAppointmentRecord;
  appointmentCreatedAt: string;
  clientName: string;
  barberName: string;
  shopLabel: string;
  paymentSummary: AppointmentPaymentSummaryView | null;
  paymentRows: PaymentRow[];
  refundRows: RefundRow[];
  routingRows: RoutingRow[];
  executionRows: ExecutionRow[];
  pointsTransactions: PointsTransactionRecord[];
  payoutVisibility: PayoutVisibilityView | null;
};

function numeric(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function formatLocationLabel(location: Pick<LocationRow, "name" | "neighborhood" | "city">) {
  const area = [location.neighborhood, location.city].filter(Boolean).join(" / ");
  return area ? `${location.name} / ${area}` : location.name;
}

async function readSupabaseAppointmentContext(
  supabase: SupabaseClient,
  appointmentId: string
): Promise<AppointmentFinancialContext | null> {
  const snapshot = await readCanonicalOperationsSnapshot(supabase);
  const appointment = snapshot.appointments.find((entry) => entry.id === appointmentId);
  if (!appointment) {
    return null;
  }

  const [appointmentResult, paymentSummary, paymentResult, pointsState, barberResult, locationResult] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, created_at")
      .eq("id", canonicalAppointmentUuid(appointmentId))
      .maybeSingle(),
    readAppointmentPaymentSummary(appointmentId, supabase).catch(() => null),
    supabase
      .from("payments")
      .select("id, appointment_id, payment_status, payment_type, provider, amount, currency, paid_at, created_at")
      .eq("appointment_id", canonicalAppointmentUuid(appointmentId))
      .order("created_at", { ascending: true }),
    readPointsStateSnapshot(),
    supabase
      .from("barbers")
      .select("id, reference_code, profile_id")
      .eq("id", canonicalBarberUuid(appointment.barberId))
      .maybeSingle(),
    supabase
      .from("locations")
      .select("id, reference_code, name, neighborhood, city")
      .eq("id", canonicalLocationUuid(appointment.locationId))
      .maybeSingle()
  ]);

  const paymentRows = ((paymentResult.data ?? []) as PaymentRow[]);
  const paymentIds = paymentRows.map((row) => row.id);
  const [refundResult, routingResult, executionResult, barberProfileResult] = await Promise.all([
    paymentIds.length
      ? supabase.from("refunds").select("id, payment_id, amount, refunded_at").in("payment_id", paymentIds)
      : Promise.resolve({ data: [], error: null }),
    paymentIds.length
      ? supabase
        .from("payment_routing_records")
        .select("id, payment_id, appointment_id, platform_fee_amount, provider_fee_amount, barber_payout_amount, shop_split_amount, payout_readiness_status, money_routing_status, blocked_reason, reconciliation_status, updated_at")
        .in("payment_id", paymentIds)
      : Promise.resolve({ data: [], error: null }),
    paymentIds.length
      ? supabase
        .from("payout_executions")
        .select("id, payment_id, appointment_id, amount, execution_status, failure_reason, blocked_reason, processor_transfer_id, reconciliation_status, executed_at, failed_at, reversed_at, created_at, updated_at")
        .in("payment_id", paymentIds)
        .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    barberResult.data?.profile_id
      ? supabase.from("profiles").select("id, full_name, email").eq("id", barberResult.data.profile_id).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);

  const payoutVisibility = await readAppointmentPayoutVisibility(appointmentId, supabase).catch(() => null);
  const clientName = snapshot.clients.find((entry) => entry.id === appointment.clientId)?.name ?? appointment.clientId;
  const pointsTransactions = pointsState.transactions.filter((transaction) =>
    transaction.sourceId === appointmentId
    || transaction.metadata.appointmentId === appointmentId
  );

  return {
    appointment,
    appointmentCreatedAt: (appointmentResult.data as AppointmentRow | null)?.created_at ?? appointment.updatedAt,
    clientName,
    barberName: (barberProfileResult.data as ProfileRow | null)?.full_name
      ?? (barberResult.data as BarberRow | null)?.reference_code
      ?? appointment.barberId,
    shopLabel: locationResult.data
      ? formatLocationLabel(locationResult.data as LocationRow)
      : appointment.locationId,
    paymentSummary,
    paymentRows,
    refundRows: (refundResult.data ?? []) as RefundRow[],
    routingRows: (routingResult.data ?? []) as RoutingRow[],
    executionRows: (executionResult.data ?? []) as ExecutionRow[],
    pointsTransactions,
    payoutVisibility
  };
}

async function readDemoAppointmentContext(appointmentId: string): Promise<AppointmentFinancialContext | null> {
  const provider = await getLiveOperationsProvider();
  const snapshot = await provider.readSnapshot({ role: "public" } as LiveOperationsViewer);
  const appointment = snapshot.appointments.find((entry) => entry.id === appointmentId);
  if (!appointment) {
    return null;
  }

  const pointsState = await readPointsStateSnapshot();
  return {
    appointment,
    appointmentCreatedAt: appointment.updatedAt,
    clientName: snapshot.clients.find((entry) => entry.id === appointment.clientId)?.name ?? appointment.clientId,
    barberName: appointment.barberId,
    shopLabel: appointment.locationId,
    paymentSummary: null,
    paymentRows: [],
    refundRows: [],
    routingRows: [],
    executionRows: [],
    pointsTransactions: pointsState.transactions.filter((transaction) =>
      transaction.sourceId === appointmentId
      || transaction.metadata.appointmentId === appointmentId
    ),
    payoutVisibility: null
  };
}

export async function readAppointmentFinancialContext(appointmentId: string): Promise<AppointmentFinancialContext | null> {
  if (!isSupabaseEnabled()) {
    return readDemoAppointmentContext(appointmentId);
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return readDemoAppointmentContext(appointmentId);
  }

  return readSupabaseAppointmentContext(supabase, appointmentId);
}

export function buildBookingTransactionBreakdownFromContext(
  context: AppointmentFinancialContext
): BookingTransactionBreakdownView {
  const gross = roundCurrency(numeric(context.appointment.subtotal ?? context.appointment.totalAmount));
  const discounts = roundCurrency(numeric(context.appointment.discountTotal));
  const net = roundCurrency(Math.max(gross - discounts, 0));
  const tax = roundCurrency(numeric(context.appointment.taxTotal));
  const tip = roundCurrency(numeric(context.appointment.tipAmount));
  const total = roundCurrency(numeric(context.appointment.grandTotal ?? context.appointment.totalAmount));
  const platformFee = roundCurrency(context.routingRows.reduce((sum, row) => sum + numeric(row.platform_fee_amount), 0));
  const processorFee = roundCurrency(context.routingRows.reduce((sum, row) => sum + numeric(row.provider_fee_amount), 0));
  const barberEarnings = roundCurrency(context.routingRows.reduce((sum, row) => sum + numeric(row.barber_payout_amount), 0));
  const shopEarnings = roundCurrency(context.routingRows.reduce((sum, row) => sum + numeric(row.shop_split_amount), 0));
  const pointsUsed = Math.abs(
    roundCurrency(
      context.pointsTransactions
        .filter((transaction) => transaction.pointsDelta < 0 && transaction.sourceType === "booking_redemption")
        .reduce((sum, transaction) => sum + transaction.pointsDelta, 0)
    )
  );
  const pointsEarned = roundCurrency(
    context.pointsTransactions
      .filter((transaction) => transaction.pointsDelta > 0)
      .reduce((sum, transaction) => sum + transaction.pointsDelta, 0)
  );

  return {
    appointmentId: context.appointment.id,
    currency: context.paymentRows[0]?.currency ?? context.paymentSummary?.latestBookingPayment?.currency ?? "usd",
    gross,
    discounts,
    net,
    tax,
    tip,
    total,
    platformFee,
    processorFee,
    barberEarnings,
    shopEarnings,
    pointsUsed,
    pointsEarned,
    payoutStatus: context.payoutVisibility?.status ?? "not_ready"
  };
}

export async function readBookingTransactionBreakdown(appointmentId: string) {
  const context = await readAppointmentFinancialContext(appointmentId);
  if (!context) {
    return null;
  }

  return buildBookingTransactionBreakdownFromContext(context);
}
