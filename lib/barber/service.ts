import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isUpcomingAppointmentStatus } from "@/lib/appointments/domain";
import { findCanonicalBookableSlot } from "@/lib/booking/intelligence";
import { canonicalAppointmentUuid, canonicalBarberUuid, canonicalLocationUuid, readCanonicalWorkingHours } from "@/lib/booking/canonical-booking";
import { getBarberAppointmentsPayload, getBarberDashboardPayload } from "@/lib/booking/platform-service";
import { buildClientHistoryIntelligence } from "@/lib/engagement/intelligence";
import { buildBarberMoneyDashboardSummary } from "@/lib/fintech/tax";
import { buildBarberRevenueIntelligenceSummary } from "@/lib/monetization/service";
import { toBarberViewer } from "@/lib/booking/route-auth";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import {
  buildBarberScheduleRange,
  buildBarberStatusNote,
  filterAppointmentsForBarberScheduleRange,
  formatLiveStatusLabel,
  legacyStatusFromLiveStatus,
  normalizeBarberScheduleViewMode,
  normalizeBarberStatusInput,
  normalizeWorkingHoursRows,
  resolveBarberScheduleAnchorDate,
  type BarberScheduleViewMode,
  type BarberLiveStatus
} from "@/lib/barber/domain";
import type { LiveAppointmentRecord } from "@/lib/operations/live-state";
import type { BarberMoneyDashboardView } from "@/types/fintech";
import type { BarberRevenueIntelligenceView } from "@/types/monetization";
import type { UserAccount } from "@/types/domain";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type BarberStatusRow = {
  barber_reference: string;
  shop_reference: string | null;
  status: "available" | "busy" | "offline";
  next_available_at: string | null;
  accepting_bookings: boolean;
  availability_note: string | null;
  updated_at: string;
  barber_id: string | null;
  current_shop_id: string | null;
  live_status: BarberLiveStatus | null;
  is_online: boolean | null;
  accepts_walk_ins: boolean | null;
  last_seen_at: string | null;
};

type BarberRow = {
  id: string;
  reference_code: string | null;
  profile_id: string;
  compensation_model: string;
};

type LocationRow = {
  id: string;
  reference_code: string | null;
  name: string;
  neighborhood: string;
  city: string;
  state: string;
};

type PaymentRow = {
  appointment_id: string | null;
  payment_status: string;
  payment_type: string;
  amount: number | string;
  created_at: string;
};

type TipRow = {
  appointment_id: string;
  amount: number | string;
  created_at: string;
};

type BlockedTimeRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
};

type CanonicalWorkingHoursView = {
  barber_reference: string;
  shop_reference: string;
  weekday: number;
  start_time: string;
  end_time: string;
};

export type BarberShopScopeView = {
  id: string;
  label: string;
};

type BaseBarberAppointment = Awaited<ReturnType<typeof getBarberAppointmentsPayload>>["appointments"][number];
type BaseBarberDashboard = Awaited<ReturnType<typeof getBarberDashboardPayload>>;

export type BarberPaymentSummaryView = {
  latestStatus: string | null;
  latestStatusLabel: string;
  authorizedAmount: number;
  capturedAmount: number;
  refundedAmount: number;
  tipAmount: number;
  outstandingBalance: number;
};

export type BarberOperationalAppointmentView = BaseBarberAppointment & {
  financial: BarberPaymentSummaryView;
};

export type BarberStatusView = {
  barberId: string;
  currentShopId: string | null;
  currentShopLabel: string | null;
  liveStatus: BarberLiveStatus;
  liveStatusLabel: string;
  isOnline: boolean;
  acceptsWalkIns: boolean;
  nextAvailableAt: string | null;
  lastSeenAt: string | null;
  updatedAt: string | null;
  note: string;
};

export type BarberWorkingHoursView = {
  locationId: string;
  locationLabel: string;
  weekday: number;
  startTime: string;
  endTime: string;
};

export type BarberBlockedTimeView = {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
};

export type BarberClientRelationshipView = {
  clientId: string;
  clientName: string;
  email: string;
  phone: string;
  retentionTag: string;
  totalAppointments: number;
  completedAppointments: number;
  activeAppointments: number;
  cancelledAppointments: number;
  lastVisitAt: string | null;
  nextVisitAt: string | null;
  latestServiceName: string | null;
  latestServiceId: string | null;
  lifetimeGrossSales: number;
  averageTicket: number;
  relationshipLabel: string;
  favoriteRelationship: boolean;
  intelligence: {
    rebookingWindow: "building" | "on_track" | "due_soon" | "due_now" | "overdue" | "scheduled";
    churnRisk: "low" | "medium" | "high";
    loyaltySegment: "new" | "repeat" | "loyal" | "vip" | "at_risk";
    nextBestAction: string;
  };
  canMessage: boolean;
  messageAppointmentId: string | null;
  clientNotes?: string[];
  lastAppointmentNote?: string | null;
  recentVisits?: Array<{
    appointmentId: string;
    serviceName: string | null;
    startsAt: string;
    status: string;
    note: string | null;
    totalAmount: number;
  }>;
};

export type BarberEarningsSummaryView = {
  businessDate: string;
  todayBookings: number;
  clientsRebookedToday: number;
  upcomingBookings: number;
  completedServices: number;
  grossSales: number;
  tips: number;
  averageTicket: number;
  outstandingCheckoutCount: number;
};

export type BarberOverviewPayload = {
  barberId: string;
  barberName: string;
  shops: BarberShopScopeView[];
  status: BarberStatusView;
  summary: BaseBarberDashboard["summary"];
  nextAppointment: BarberOperationalAppointmentView | null;
  todayAppointments: BarberOperationalAppointmentView[];
  upcomingAppointments: BarberOperationalAppointmentView[];
  workingHours: BarberWorkingHoursView[];
  blockedTimes: BarberBlockedTimeView[];
  quickClients: BarberClientRelationshipView[];
  earnings: BarberEarningsSummaryView;
};

export type BarberSchedulePayload = {
  barberId: string;
  barberName: string;
  businessDate: string;
  shops: BarberShopScopeView[];
  status: BarberStatusView;
  todayAppointments: BarberOperationalAppointmentView[];
  upcomingAppointments: BarberOperationalAppointmentView[];
  timeline: {
    viewMode: BarberScheduleViewMode;
    anchorDate: string;
    rangeStart: string;
    rangeEnd: string;
    rangeLabel: string;
    appointments: BarberOperationalAppointmentView[];
  };
  workingHours: BarberWorkingHoursView[];
  blockedTimes: BarberBlockedTimeView[];
};

export type BarberClientsPayload = {
  barberId: string;
  barberName: string;
  clients: BarberClientRelationshipView[];
};

export type BarberEarningsPayload = {
  barberId: string;
  barberName: string;
  summary: BarberEarningsSummaryView;
  growth: BarberRevenueIntelligenceView;
  money: BarberMoneyDashboardView;
  recentAppointments: BarberOperationalAppointmentView[];
};

export class BarberToolsServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function getSupabase() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  return createSupabaseAdminClient();
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function formatLocationLabel(location: Pick<LocationRow, "name" | "neighborhood" | "city" | "state">) {
  const area = [location.neighborhood, location.city].filter(Boolean).join(" • ");
  return area ? `${location.name} • ${area}` : [location.name, location.state].filter(Boolean).join(" • ");
}

function formatPaymentStatusLabel(status: string | null, outstandingBalance: number) {
  if (status === "captured" && outstandingBalance <= 0) {
    return "Paid in full";
  }

  if (status === "authorized") {
    return "Deposit secured";
  }

  if (status === "partially_refunded") {
    return "Partially refunded";
  }

  if (status === "refunded") {
    return "Refunded";
  }

  if (status === "voided") {
    return "Voided";
  }

  if (outstandingBalance > 0 && status === "captured") {
    return "Partially paid";
  }

  return status
    ? status
      .split("_")
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" ")
    : "No payment yet";
}

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function assertBarberUser(user: UserAccount) {
  const viewer = toBarberViewer(user);
  if (!viewer || !viewer.barberId) {
    throw new BarberToolsServiceError("Only barbers can use barber tools.", 403);
  }

  return viewer;
}

async function resolveBarberContext(user: UserAccount, supabase: SupabaseClient) {
  const viewer = assertBarberUser(user);
  const barberReference = viewer.barberId!;
  const barberUuid = canonicalBarberUuid(barberReference);
  const barberResult = await supabase
    .from("barbers")
    .select("id, reference_code, profile_id, compensation_model")
    .or(`reference_code.eq.${barberReference},id.eq.${barberUuid}`)
    .maybeSingle();

  if (barberResult.error) {
    throw new BarberToolsServiceError("Unable to resolve the barber account.", 500);
  }

  if (!barberResult.data) {
    throw new BarberToolsServiceError("No barber account is available for these tools.", 404);
  }

  const barber = barberResult.data as BarberRow;
  const referenceIds = viewer.locationIds ?? [];
  const fallbackLocationsResult = referenceIds.length
    ? await supabase
      .from("locations")
      .select("id, reference_code, name, neighborhood, city, state")
      .in("reference_code", referenceIds)
    : { data: [], error: null };

  if (fallbackLocationsResult.error) {
    throw new BarberToolsServiceError("Unable to resolve barber shop assignments.", 500);
  }

  return {
    viewer,
    barber,
    barberReference: barber.reference_code ?? barberReference,
    locations: (fallbackLocationsResult.data ?? []) as LocationRow[]
  };
}

async function readLocationMap(supabase: SupabaseClient, references: string[]) {
  if (!references.length) {
    return new Map<string, { id: string; label: string }>();
  }

  const uniqueReferences = Array.from(new Set(references.filter(Boolean)));
  const uuidValues = uniqueReferences.filter(isUuidLike);
  const referenceValues = uniqueReferences.filter((value) => !isUuidLike(value));
  const [referenceResult, uuidResult] = await Promise.all([
    referenceValues.length
      ? supabase
        .from("locations")
        .select("id, reference_code, name, neighborhood, city, state")
        .in("reference_code", referenceValues)
      : Promise.resolve({ data: [], error: null }),
    uuidValues.length
      ? supabase
        .from("locations")
        .select("id, reference_code, name, neighborhood, city, state")
        .in("id", uuidValues)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (referenceResult.error || uuidResult.error) {
    throw new BarberToolsServiceError("Unable to read barber shop labels.", 500);
  }

  const rows = [
    ...((referenceResult.data ?? []) as LocationRow[]),
    ...((uuidResult.data ?? []) as LocationRow[])
  ];

  return new Map(
    rows.flatMap((row) => {
      const id = row.reference_code ?? row.id;
      const label = formatLocationLabel(row);
      return [
        [id, { id, label }],
        [row.id, { id, label }]
      ] as const;
    })
  );
}

function buildShopScopeView(locations: LocationRow[]) {
  return locations.map((location) => ({
    id: location.reference_code ?? location.id,
    label: formatLocationLabel(location)
  }));
}

async function readBlockedTimes(supabase: SupabaseClient, barberReference: string) {
  const result = await supabase
    .from("blocked_times")
    .select("id, starts_at, ends_at, reason")
    .eq("barber_id", canonicalBarberUuid(barberReference))
    .gte("ends_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(12);

  if (result.error) {
    throw new BarberToolsServiceError("Unable to read blocked time for this barber.", 500);
  }

  return ((result.data ?? []) as BlockedTimeRow[]).map((row) => ({
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    reason: row.reason
  }));
}

function buildFallbackPaymentSummary(appointment: LiveAppointmentRecord): BarberPaymentSummaryView {
  const capturedAmount = Math.max(appointment.totalAmount - appointment.balanceDue, 0);
  const authorizedAmount = capturedAmount === 0 && appointment.depositAmount > 0 ? appointment.depositAmount : 0;
  const latestStatus = capturedAmount > 0
    ? "captured"
    : authorizedAmount > 0
      ? "authorized"
      : null;

  return {
    latestStatus,
    latestStatusLabel: formatPaymentStatusLabel(latestStatus, appointment.balanceDue),
    authorizedAmount,
    capturedAmount,
    refundedAmount: appointment.status === "refunded" ? appointment.totalAmount : 0,
    tipAmount: appointment.tipAmount,
    outstandingBalance: appointment.balanceDue
  };
}

async function readPaymentSummaryMap(
  supabase: SupabaseClient | null,
  appointments: BaseBarberAppointment[]
) {
  const map = new Map<string, BarberPaymentSummaryView>();

  if (!appointments.length) {
    return map;
  }

  if (!supabase) {
    for (const appointment of appointments) {
      map.set(appointment.id, buildFallbackPaymentSummary(appointment));
    }
    return map;
  }

  const appointmentIds = appointments.map((appointment) => canonicalAppointmentUuid(appointment.id));
  const appointmentIdToReference = new Map(appointments.map((appointment) => [canonicalAppointmentUuid(appointment.id), appointment.id]));
  const [paymentsResult, tipsResult] = await Promise.all([
    supabase
      .from("payments")
      .select("appointment_id, payment_status, payment_type, amount, created_at")
      .in("appointment_id", appointmentIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("tips")
      .select("appointment_id, amount, created_at")
      .in("appointment_id", appointmentIds)
      .order("created_at", { ascending: false })
  ]);

  if (paymentsResult.error || tipsResult.error) {
    throw new BarberToolsServiceError("Unable to read payment outcomes for barber appointments.", 500);
  }

  const payments = (paymentsResult.data ?? []) as PaymentRow[];
  const tips = (tipsResult.data ?? []) as TipRow[];
  const groupedPayments = new Map<string, PaymentRow[]>();
  const groupedTips = new Map<string, TipRow[]>();

  for (const payment of payments) {
    if (!payment.appointment_id) {
      continue;
    }
    const rows = groupedPayments.get(payment.appointment_id) ?? [];
    rows.push(payment);
    groupedPayments.set(payment.appointment_id, rows);
  }

  for (const tip of tips) {
    const rows = groupedTips.get(tip.appointment_id) ?? [];
    rows.push(tip);
    groupedTips.set(tip.appointment_id, rows);
  }

  for (const appointment of appointments) {
    const appointmentId = canonicalAppointmentUuid(appointment.id);
    const paymentRows = groupedPayments.get(appointmentId) ?? [];
    const tipRows = groupedTips.get(appointmentId) ?? [];
    const bookingRows = paymentRows.filter((row) => row.payment_type === "booking");
    const latestBooking = bookingRows[0] ?? null;
    const authorizedAmount = bookingRows
      .filter((row) => row.payment_status === "authorized")
      .reduce((sum, row) => sum + toNumber(row.amount), 0);
    const capturedAmount = bookingRows
      .filter((row) => row.payment_status === "captured" || row.payment_status === "partially_refunded" || row.payment_status === "refunded")
      .reduce((sum, row) => sum + toNumber(row.amount), 0);
    const refundedAmount = bookingRows
      .filter((row) => row.payment_status === "partially_refunded" || row.payment_status === "refunded")
      .reduce((sum, row) => sum + toNumber(row.amount), 0);
    const tipAmount = tipRows.reduce((sum, row) => sum + toNumber(row.amount), 0);

    map.set(appointmentIdToReference.get(appointmentId) ?? appointment.id, {
      latestStatus: latestBooking?.payment_status ?? null,
      latestStatusLabel: formatPaymentStatusLabel(latestBooking?.payment_status ?? null, appointment.balanceDue),
      authorizedAmount,
      capturedAmount,
      refundedAmount,
      tipAmount,
      outstandingBalance: appointment.balanceDue
    });
  }

  return map;
}

function hydrateAppointmentsWithFinancials(
  appointments: BaseBarberAppointment[],
  financialMap: Map<string, BarberPaymentSummaryView>
) {
  return appointments.map((appointment) => ({
    ...appointment,
    financial: financialMap.get(appointment.id) ?? buildFallbackPaymentSummary(appointment)
  }));
}

async function readWorkingHoursView(
  supabase: SupabaseClient | null,
  barberReference: string,
  locationLabels: Map<string, { id: string; label: string }>
) {
  if (!supabase) {
    return [] as BarberWorkingHoursView[];
  }

  const rows = await readCanonicalWorkingHours(supabase, barberReference);
  return (rows as CanonicalWorkingHoursView[]).map((row) => ({
    locationId: row.shop_reference,
    locationLabel: locationLabels.get(row.shop_reference)?.label ?? row.shop_reference,
    weekday: row.weekday,
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5)
  }));
}

async function buildStatusView(
  user: UserAccount,
  appointments: BaseBarberAppointment[],
  supabase: SupabaseClient | null
) {
  const activeAppointment = appointments.find((appointment) => appointment.status === "checked_in" || appointment.status === "in_service") ?? null;
  const upcomingAppointment = appointments.find((appointment) => isUpcomingAppointmentStatus(appointment.status)) ?? null;
  const defaultShopId = upcomingAppointment?.locationId ?? user.locationIds[0] ?? null;
  const defaultStatus: BarberStatusView = {
    barberId: user.barberId ?? "",
    currentShopId: defaultShopId,
    currentShopLabel: defaultShopId ?? null,
    liveStatus: activeAppointment ? "busy" : "available",
    liveStatusLabel: formatLiveStatusLabel(activeAppointment ? "busy" : "available"),
    isOnline: true,
    acceptsWalkIns: false,
    nextAvailableAt: upcomingAppointment?.start ?? null,
    lastSeenAt: new Date().toISOString(),
    updatedAt: upcomingAppointment?.updatedAt ?? new Date().toISOString(),
    note: buildBarberStatusNote(activeAppointment ? "busy" : "available", false)
  };

  if (!supabase || !user.barberId) {
    return defaultStatus;
  }

  const rowResult = await supabase
    .from("barber_status")
    .select("barber_reference, shop_reference, status, next_available_at, accepting_bookings, availability_note, updated_at, barber_id, current_shop_id, live_status, is_online, accepts_walk_ins, last_seen_at")
    .eq("barber_reference", user.barberId)
    .maybeSingle();

  if (rowResult.error) {
    throw new BarberToolsServiceError("Unable to read barber live status.", 500);
  }

  const row = rowResult.data as BarberStatusRow | null;
  if (!row) {
    return defaultStatus;
  }

  const locationLabels = await readLocationMap(
    supabase,
    [row.shop_reference, row.current_shop_id].filter((value): value is string => Boolean(value))
  );
  const currentShopId = row.shop_reference
    ?? (row.current_shop_id ? locationLabels.get(row.current_shop_id)?.id ?? row.current_shop_id : null)
    ?? defaultShopId;
  const liveStatus = row.live_status ?? (row.status === "busy" ? "busy" : row.status === "offline" ? "offline" : "available");
  const isOnline = row.is_online ?? liveStatus !== "offline";
  const acceptsWalkIns = row.accepts_walk_ins ?? row.accepting_bookings ?? false;

  return {
    barberId: row.barber_reference,
    currentShopId,
    currentShopLabel: currentShopId ? locationLabels.get(currentShopId)?.label ?? currentShopId : null,
    liveStatus,
    liveStatusLabel: formatLiveStatusLabel(liveStatus),
    isOnline,
    acceptsWalkIns,
    nextAvailableAt: row.next_available_at ?? defaultStatus.nextAvailableAt,
    lastSeenAt: row.last_seen_at ?? row.updated_at,
    updatedAt: row.updated_at,
    note: row.availability_note ?? buildBarberStatusNote(liveStatus, acceptsWalkIns)
  };
}

function buildClientRelationshipView(
  appointments: BarberOperationalAppointmentView[],
  clients: BaseBarberDashboard["clients"],
  barberReference: string
) {
  const relationships: BarberClientRelationshipView[] = [];

  for (const client of clients) {
    const clientAppointments = appointments
      .filter((appointment) => appointment.clientId === client.id)
      .sort((left, right) => new Date(right.start).getTime() - new Date(left.start).getTime());
    if (!clientAppointments.length) {
      continue;
    }

    const completed = clientAppointments.filter((appointment) => appointment.status === "completed");
    const active = clientAppointments.filter((appointment) => isUpcomingAppointmentStatus(appointment.status));
    const cancelled = clientAppointments.filter((appointment) => appointment.status === "cancelled" || appointment.status === "no_show");
    const lastCompleted = completed[0] ?? null;
    const nextAppointment = [...active].sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime())[0] ?? null;
    const latestAppointment = clientAppointments[0] ?? null;
    const lifetimeGrossSales = completed.reduce((sum, appointment) => sum + appointment.totalAmount, 0);
    const completedAppointments = completed.length;
    const recentVisits = clientAppointments.slice(0, 5).map((appointment) => ({
      appointmentId: appointment.id,
      serviceName: appointment.display.serviceName ?? null,
      startsAt: appointment.start,
      status: appointment.status,
      note: appointment.note?.trim() || null,
      totalAmount: appointment.totalAmount
    }));
    const intelligence = buildClientHistoryIntelligence({
      client,
      appointments: clientAppointments,
      favoriteBarberId: barberReference
    });

    relationships.push({
      clientId: client.id,
      clientName: client.name,
      email: client.email,
      phone: client.phone,
      retentionTag: client.retentionTag,
      totalAppointments: clientAppointments.length,
      completedAppointments,
      activeAppointments: active.length,
      cancelledAppointments: cancelled.length,
      lastVisitAt: lastCompleted?.start ?? null,
      nextVisitAt: nextAppointment?.start ?? null,
      latestServiceName: latestAppointment?.display.serviceName ?? null,
      latestServiceId: latestAppointment?.serviceId ?? null,
      lifetimeGrossSales,
      averageTicket: completedAppointments ? lifetimeGrossSales / completedAppointments : 0,
      relationshipLabel: completedAppointments > 2 ? "Repeat guest" : completedAppointments > 0 ? "Returning guest" : "New relationship",
      favoriteRelationship: client.favoriteBarberId === barberReference,
      intelligence: {
        rebookingWindow: intelligence.rebookingWindow,
        churnRisk: intelligence.churnRisk,
        loyaltySegment: intelligence.loyaltySegment,
        nextBestAction: intelligence.nextBestAction
      },
      canMessage: Boolean(nextAppointment ?? latestAppointment),
      messageAppointmentId: nextAppointment?.id ?? latestAppointment?.id ?? null,
      clientNotes: client.notes ?? [],
      lastAppointmentNote: latestAppointment?.note?.trim() || null,
      recentVisits
    });
  }

  return relationships.sort((left, right) => {
    const leftNext = left.nextVisitAt ? new Date(left.nextVisitAt).getTime() : Number.MAX_SAFE_INTEGER;
    const rightNext = right.nextVisitAt ? new Date(right.nextVisitAt).getTime() : Number.MAX_SAFE_INTEGER;
    if (leftNext !== rightNext) {
      return leftNext - rightNext;
    }

    return right.completedAppointments - left.completedAppointments;
  });
}

function buildEarningsSummary(
  businessDate: string,
  appointments: BarberOperationalAppointmentView[]
) {
  const todayAppointments = appointments.filter((appointment) => appointment.start.slice(0, 10) === businessDate);
  const completedToday = todayAppointments.filter((appointment) => appointment.status === "completed");
  const clientsRebookedToday = new Set(
    completedToday
      .filter((appointment) =>
        appointments.some((candidate) =>
          candidate.id !== appointment.id
          && candidate.clientId === appointment.clientId
          && isUpcomingAppointmentStatus(candidate.status)
          && new Date(candidate.start).getTime() > new Date(appointment.end).getTime()
        )
      )
      .map((appointment) => appointment.clientId)
  ).size;
  const grossSales = completedToday.reduce((sum, appointment) => sum + appointment.totalAmount, 0);
  const tips = completedToday.reduce((sum, appointment) => sum + appointment.financial.tipAmount, 0);
  const completedServices = completedToday.length;

  return {
    businessDate,
    todayBookings: todayAppointments.length,
    clientsRebookedToday,
    upcomingBookings: appointments.filter((appointment) => isUpcomingAppointmentStatus(appointment.status)).length,
    completedServices,
    grossSales,
    tips,
    averageTicket: completedServices ? grossSales / completedServices : 0,
    outstandingCheckoutCount: todayAppointments.filter((appointment) => appointment.status === "completed" && appointment.balanceDue > 0).length
  } satisfies BarberEarningsSummaryView;
}

export async function getBarberOverviewPayload(user: UserAccount): Promise<BarberOverviewPayload> {
  const viewer = assertBarberUser(user);
  const supabase = getSupabase();
  const dashboard = await getBarberDashboardPayload(viewer);
  const context = supabase ? await resolveBarberContext(user, supabase) : null;
  const financialMap = await readPaymentSummaryMap(supabase, dashboard.appointments);
  const appointments = hydrateAppointmentsWithFinancials(dashboard.appointments, financialMap);
  const todayAppointments = appointments
    .filter((appointment) => appointment.start.slice(0, 10) === dashboard.summary.businessDate)
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());
  const upcomingAppointments = appointments
    .filter((appointment) => isUpcomingAppointmentStatus(appointment.status))
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());
  const locationReferences = Array.from(new Set(todayAppointments.map((appointment) => appointment.locationId)));
  const locationMap = supabase ? await readLocationMap(supabase, locationReferences) : new Map<string, { id: string; label: string }>();
  const [status, workingHours, blockedTimes] = await Promise.all([
    buildStatusView(user, appointments, supabase),
    readWorkingHoursView(supabase, viewer.barberId!, locationMap),
    supabase ? readBlockedTimes(supabase, viewer.barberId!) : Promise.resolve([])
  ]);
  const clients = buildClientRelationshipView(appointments, dashboard.clients, viewer.barberId!);
  const earnings = buildEarningsSummary(dashboard.summary.businessDate, appointments);

  return {
    barberId: viewer.barberId!,
    barberName: user.name,
    shops: context ? buildShopScopeView(context.locations) : [],
    status,
    summary: dashboard.summary,
    nextAppointment: upcomingAppointments[0] ?? null,
    todayAppointments,
    upcomingAppointments,
    workingHours,
    blockedTimes,
    quickClients: clients.slice(0, 4),
    earnings
  };
}

export async function getBarberSchedulePayload(
  user: UserAccount,
  options?: {
    viewMode?: BarberScheduleViewMode;
    anchorDate?: string;
  }
): Promise<BarberSchedulePayload> {
  const viewer = assertBarberUser(user);
  const supabase = getSupabase();
  const dashboard = await getBarberDashboardPayload(viewer);
  const context = supabase ? await resolveBarberContext(user, supabase) : null;
  const financialMap = await readPaymentSummaryMap(supabase, dashboard.appointments);
  const appointments = hydrateAppointmentsWithFinancials(dashboard.appointments, financialMap);
  const viewMode = normalizeBarberScheduleViewMode(options?.viewMode);
  const anchorDate = resolveBarberScheduleAnchorDate(options?.anchorDate, dashboard.summary.businessDate);
  const timelineRange = buildBarberScheduleRange(viewMode, anchorDate);
  const locationReferences = Array.from(new Set(appointments.map((appointment) => appointment.locationId)));
  const locationMap = supabase ? await readLocationMap(supabase, locationReferences) : new Map<string, { id: string; label: string }>();
  const [status, workingHours, blockedTimes] = await Promise.all([
    buildStatusView(user, appointments, supabase),
    readWorkingHoursView(supabase, viewer.barberId!, locationMap),
    supabase ? readBlockedTimes(supabase, viewer.barberId!) : Promise.resolve([])
  ]);

  return {
    barberId: viewer.barberId!,
    barberName: user.name,
    businessDate: dashboard.summary.businessDate,
    shops: context ? buildShopScopeView(context.locations) : [],
    status,
    todayAppointments: appointments
      .filter((appointment) => appointment.start.slice(0, 10) === dashboard.summary.businessDate)
      .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime()),
    upcomingAppointments: appointments
      .filter((appointment) => isUpcomingAppointmentStatus(appointment.status))
      .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime()),
    timeline: {
      ...timelineRange,
      appointments: filterAppointmentsForBarberScheduleRange(appointments, timelineRange)
    },
    workingHours,
    blockedTimes
  };
}

export async function getBarberClientsPayload(user: UserAccount): Promise<BarberClientsPayload> {
  const viewer = assertBarberUser(user);
  const supabase = getSupabase();
  const dashboard = await getBarberDashboardPayload(viewer);
  const financialMap = await readPaymentSummaryMap(supabase, dashboard.appointments);
  const appointments = hydrateAppointmentsWithFinancials(dashboard.appointments, financialMap);

  return {
    barberId: viewer.barberId!,
    barberName: user.name,
    clients: buildClientRelationshipView(appointments, dashboard.clients, viewer.barberId!)
  };
}

export async function getBarberEarningsPayload(user: UserAccount): Promise<BarberEarningsPayload> {
  const viewer = assertBarberUser(user);
  const supabase = getSupabase();
  const dashboard = await getBarberDashboardPayload(viewer);
  const financialMap = await readPaymentSummaryMap(supabase, dashboard.appointments);
  const appointments = hydrateAppointmentsWithFinancials(dashboard.appointments, financialMap);
  const businessDate = dashboard.summary.businessDate;
  const summary = buildEarningsSummary(businessDate, appointments);
  const recentAppointments = appointments
    .filter((appointment) => appointment.status === "completed")
    .sort((left, right) => new Date(right.start).getTime() - new Date(left.start).getTime())
    .slice(0, 8);
  const growth = await buildBarberRevenueIntelligenceSummary({
    user,
    businessDate,
    appointments
  });
  const money = await buildBarberMoneyDashboardSummary({
    userId: user.id,
    barberId: viewer.barberId!,
    todayEarnings: summary.grossSales,
    appointments,
    year: Number(businessDate.slice(0, 4)) || new Date().getFullYear()
  });

  return {
    barberId: viewer.barberId!,
    barberName: user.name,
    summary,
    growth,
    money,
    recentAppointments
  };
}

export async function getBarberStatusPayload(user: UserAccount) {
  const viewer = assertBarberUser(user);
  const supabase = getSupabase();
  const dashboard = await getBarberDashboardPayload(viewer);
  const financialMap = await readPaymentSummaryMap(supabase, dashboard.appointments);
  const appointments = hydrateAppointmentsWithFinancials(dashboard.appointments, financialMap);
  return buildStatusView(user, appointments, supabase);
}

export async function updateBarberStatus(
  user: UserAccount,
  input: {
    liveStatus: BarberLiveStatus;
    isOnline?: boolean;
    acceptsWalkIns?: boolean;
    currentShopId?: string | null;
  }
) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new BarberToolsServiceError("Barber status updates require the live Supabase environment.", 503);
  }

  const context = await resolveBarberContext(user, supabase);
  const normalized = normalizeBarberStatusInput(input);
  const allowedShopIds = new Set(context.locations.map((location) => location.reference_code ?? location.id));
  const currentShopId = normalized.currentShopId ?? context.locations[0]?.reference_code ?? context.locations[0]?.id ?? null;

  if (currentShopId && !allowedShopIds.has(currentShopId)) {
    throw new BarberToolsServiceError("This barber cannot switch to a shop outside their assigned footprint.", 403);
  }

  const nextSlot = normalized.isOnline
    ? await findCanonicalBookableSlot(supabase, context.barberReference, {
      preferredLocationId: currentShopId ?? undefined,
      earliestAt: new Date().toISOString()
    })
    : null;

  const liveStatus = normalized.liveStatus;
  const note = buildBarberStatusNote(liveStatus, normalized.acceptsWalkIns);
  const updatedAt = new Date().toISOString();
  const legacyStatus = legacyStatusFromLiveStatus(liveStatus);
  const currentShopUuid = currentShopId ? canonicalLocationUuid(currentShopId) : null;

  const result = await supabase.from("barber_status").upsert({
    barber_reference: context.barberReference,
    barber_id: context.barber.id,
    shop_reference: currentShopId,
    current_shop_id: currentShopUuid,
    status: legacyStatus,
    live_status: liveStatus,
    is_online: normalized.isOnline,
    accepts_walk_ins: normalized.acceptsWalkIns,
    accepting_bookings: normalized.isOnline && liveStatus === "available",
    next_available_at: nextSlot?.slot.startsAt ?? null,
    availability_note: note,
    last_seen_at: updatedAt,
    updated_at: updatedAt
  }, { onConflict: "barber_reference" });

  if (result.error) {
    throw new BarberToolsServiceError("Unable to update barber live status.", 500);
  }

  return getBarberStatusPayload(user);
}

export async function updateBarberSchedule(
  user: UserAccount,
  input: {
    locationId: string;
    workingHours?: Array<{
      weekday: number;
      startTime: string;
      endTime: string;
    }>;
    blockedPeriod?: {
      startsAt: string;
      endsAt: string;
      reason?: string;
    };
  }
) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new BarberToolsServiceError("Barber schedule updates require the live Supabase environment.", 503);
  }

  const context = await resolveBarberContext(user, supabase);
  const allowedShopIds = new Set(context.locations.map((location) => location.reference_code ?? location.id));
  if (!allowedShopIds.has(input.locationId)) {
    throw new BarberToolsServiceError("This barber cannot edit schedule outside their assigned shops.", 403);
  }

  if (input.workingHours) {
    const workingHours = normalizeWorkingHoursRows(input.workingHours);
    const deleteResult = await supabase
      .from("availability_rules")
      .delete()
      .eq("barber_id", context.barber.id)
      .eq("location_id", canonicalLocationUuid(input.locationId));

    if (deleteResult.error) {
      throw new BarberToolsServiceError("Unable to reset barber working hours.", 500);
    }

    if (workingHours.length) {
      const insertResult = await supabase
        .from("availability_rules")
        .insert(workingHours.map((row) => ({
          barber_id: context.barber.id,
          location_id: canonicalLocationUuid(input.locationId),
          weekday: row.weekday,
          start_time: row.startTime,
          end_time: row.endTime
        })));

      if (insertResult.error) {
        throw new BarberToolsServiceError("Unable to save barber working hours.", 500);
      }
    }
  }

  if (input.blockedPeriod) {
    const startsAt = new Date(input.blockedPeriod.startsAt);
    const endsAt = new Date(input.blockedPeriod.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || startsAt.getTime() >= endsAt.getTime()) {
      throw new BarberToolsServiceError("Blocked time must have a valid start and end.", 400);
    }

    const insertResult = await supabase.from("blocked_times").insert({
      barber_id: context.barber.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      reason: input.blockedPeriod.reason?.trim() || null
    });

    if (insertResult.error) {
      throw new BarberToolsServiceError("Unable to save barber time-off block.", 500);
    }
  }

  const nextSlot = await findCanonicalBookableSlot(supabase, context.barberReference, {
    preferredLocationId: input.locationId,
    earliestAt: new Date().toISOString()
  });
  const updatedAt = new Date().toISOString();
  await supabase.from("barber_status").upsert({
    barber_reference: context.barberReference,
    barber_id: context.barber.id,
    shop_reference: input.locationId,
    current_shop_id: canonicalLocationUuid(input.locationId),
    next_available_at: nextSlot?.slot.startsAt ?? null,
    last_seen_at: updatedAt,
    updated_at: updatedAt
  }, { onConflict: "barber_reference" });

  return getBarberSchedulePayload(user);
}
