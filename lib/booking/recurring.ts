import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  canonicalAppointmentUuid,
  canonicalBarberUuid,
  canonicalClientUuid,
  canonicalLocationUuid,
  canonicalServiceUuid,
  ensureCanonicalBookingData,
  readCanonicalClientProfile
} from "@/lib/booking/canonical-booking";
import { findCanonicalBookableSlot } from "@/lib/booking/intelligence";
import { createCapturedStripePaymentRecord } from "@/lib/payments/service";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type ClientPreferenceRow = {
  client_reference: string;
  favorite_shop_reference: string | null;
  preferred_location_reference: string | null;
};

type RebookingCycleRow = {
  id: string;
  client_reference: string;
  client_email: string;
  barber_reference: string | null;
  service_reference: string | null;
  average_cycle_days: number;
  confidence: string;
  last_completed_at: string | null;
  next_suggested_at: string | null;
  updated_at: string;
};

type CanonicalServiceRow = {
  id: string;
  reference_code: string | null;
  location_id: string;
  barber_reference: string | null;
  name: string;
  category: string;
  description: string | null;
  duration_min: number;
  buffer_min: number;
  price: number | string;
  deposit_amount: number | string;
  full_prepay_required: boolean;
  active: boolean;
};

type CanonicalLocationRow = {
  id: string;
  reference_code: string | null;
  name: string;
  neighborhood: string;
  city: string;
  state: string;
};

type CanonicalBarberRow = {
  id: string;
  reference_code: string | null;
  profile_id: string;
};

type CanonicalProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type CanonicalAppointmentRow = {
  id: string;
  reference_code: string | null;
  client_id: string;
  barber_id: string;
  location_id: string;
  service_id: string;
  status: string;
  starts_at: string;
  ends_at: string;
};

type RecurringTrigger = "routine_saved" | "appointment_completed";

type EnsureRecurringBookingInput = {
  clientId: string;
  trigger: RecurringTrigger;
  completedAppointment?: {
    appointmentId: string;
    barberReference: string;
    serviceReference: string;
    locationReference: string;
    completedAt: string;
  };
};

export type RecurringBookingResult = {
  status: "booked" | "proposal_only" | "skipped";
  reason:
    | "existing_upcoming_appointment"
    | "missing_routine"
    | "missing_barber"
    | "missing_service"
    | "missing_client"
    | "no_slot_available"
    | "already_locked"
    | "scheduled"
    | "missing_preferred_location";
  appointmentId?: string;
  appointmentTime?: string;
  barberReference?: string;
  serviceReference?: string;
  locationReference?: string;
  recommendationStatus?: string;
};

function numeric(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return value;
  }

  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getTargetDate(row: RebookingCycleRow, trigger: RecurringTrigger, completedAt?: string) {
  const now = new Date();
  const completed = completedAt ? new Date(completedAt) : null;
  const completedBase = completed && !Number.isNaN(completed.getTime()) ? completed : null;
  const suggested = row.next_suggested_at ? new Date(row.next_suggested_at) : null;
  const suggestedBase = suggested && !Number.isNaN(suggested.getTime()) ? suggested : null;
  const target = trigger === "appointment_completed" && completedBase
    ? addDays(completedBase, row.average_cycle_days)
    : suggestedBase ?? addDays(now, row.average_cycle_days);

  return new Date(Math.max(target.getTime(), now.getTime() + 15 * 60_000));
}

function buildAutoBookReference(clientId: string, barberReference: string, startsAt: string) {
  const compact = startsAt.replace(/[-:TZ.]/g, "").slice(0, 12);
  return `routine-${clientId}-${barberReference}-${compact}`;
}

function createRecommendationMessage(params: {
  status: "scheduled" | "suggested" | "skipped";
  barberName: string;
  serviceName: string;
  locationName: string;
  startsAt?: string;
}) {
  if (params.status === "scheduled" && params.startsAt) {
    const label = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(params.startsAt));

    return `Auto-book reserved ${params.serviceName} with ${params.barberName} at ${params.locationName} on ${label}.`;
  }

  if (params.status === "suggested") {
    return `Your routine is due soon with ${params.barberName}. We will hold the next clean opening for ${params.serviceName} at ${params.locationName} when availability opens.`;
  }

  return `Your routine already has an upcoming appointment, so auto-book did not add another hold.`;
}

async function readLatestRoutine(supabase: SupabaseClient, clientId: string, preferredBarberReference?: string | null) {
  const result = await supabase
    .from("rebooking_cycles")
    .select("id, client_reference, client_email, barber_reference, service_reference, average_cycle_days, confidence, last_completed_at, next_suggested_at, updated_at")
    .eq("client_reference", clientId)
    .order("updated_at", { ascending: false })
    .limit(12);

  if (result.error) {
    throw result.error;
  }

  const rows = (result.data ?? []) as RebookingCycleRow[];
  if (!rows.length) {
    return null;
  }

  return preferredBarberReference
    ? rows.find((row) => row.barber_reference === preferredBarberReference) ?? rows[0]
    : rows[0];
}

async function readClientPreference(supabase: SupabaseClient, clientId: string) {
  const result = await supabase
    .from("client_preferences")
    .select("client_reference, favorite_shop_reference, preferred_location_reference")
    .eq("client_reference", clientId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  return (result.data as ClientPreferenceRow | null) ?? null;
}

async function readCanonicalDirectories(supabase: SupabaseClient) {
  const [appointmentsResult, servicesResult, locationsResult, barbersResult, profilesResult] = await Promise.all([
    supabase.from("appointments").select("id, reference_code, client_id, barber_id, location_id, service_id, status, starts_at, ends_at"),
    supabase.from("services").select("id, reference_code, location_id, barber_reference, name, category, description, duration_min, buffer_min, price, deposit_amount, full_prepay_required, active").eq("active", true),
    supabase.from("locations").select("id, reference_code, name, neighborhood, city, state"),
    supabase.from("barbers").select("id, reference_code, profile_id"),
    supabase.from("profiles").select("id, full_name, email")
  ]);

  for (const result of [appointmentsResult, servicesResult, locationsResult, barbersResult, profilesResult]) {
    if (result.error) {
      throw result.error;
    }
  }

  return {
    appointments: (appointmentsResult.data ?? []) as CanonicalAppointmentRow[],
    services: (servicesResult.data ?? []) as CanonicalServiceRow[],
    locations: (locationsResult.data ?? []) as CanonicalLocationRow[],
    barbers: (barbersResult.data ?? []) as CanonicalBarberRow[],
    profiles: (profilesResult.data ?? []) as CanonicalProfileRow[]
  };
}

async function updateRoutineWindow(supabase: SupabaseClient, row: RebookingCycleRow, params: { nextSuggestedAt: string; lastCompletedAt?: string | null; serviceReference?: string | null; barberReference?: string | null; }) {
  const update = await supabase
    .from("rebooking_cycles")
    .update({
      next_suggested_at: params.nextSuggestedAt,
      last_completed_at: params.lastCompletedAt ?? row.last_completed_at,
      service_reference: params.serviceReference ?? row.service_reference,
      barber_reference: params.barberReference ?? row.barber_reference,
      updated_at: new Date().toISOString()
    })
    .eq("id", row.id);

  if (update.error) {
    throw update.error;
  }
}

async function writeRecommendation(supabase: SupabaseClient, params: {
  clientId: string;
  clientEmail: string;
  barberReference: string;
  serviceReference: string;
  message: string;
  remindAt: string | null;
  status: string;
  reason: string;
  metadata?: Record<string, unknown>;
}) {
  const result = await supabase.from("rebooking_recommendations").insert({
    client_reference: params.clientId,
    client_email: params.clientEmail,
    barber_reference: params.barberReference,
    service_reference: params.serviceReference,
    message: params.message,
    remind_at: params.remindAt,
    status: params.status,
    reason: params.reason,
    metadata: params.metadata ?? {},
    created_at: new Date().toISOString()
  });

  if (result.error) {
    throw result.error;
  }
}

export async function ensureRecurringBooking(supabase: SupabaseClient, input: EnsureRecurringBookingInput): Promise<RecurringBookingResult> {
  await ensureCanonicalBookingData(supabase);

  const preferredBarberReference = input.completedAppointment?.barberReference ?? null;
  const routine = await readLatestRoutine(supabase, input.clientId, preferredBarberReference);
  if (!routine?.barber_reference) {
    return {
      status: "skipped",
      reason: "missing_routine"
    };
  }

  const clientProfile = await readCanonicalClientProfile(supabase, input.clientId);
  if (!clientProfile) {
    return {
      status: "skipped",
      reason: "missing_client"
    };
  }

  const directories = await readCanonicalDirectories(supabase);
  const clientUuid = canonicalClientUuid(input.clientId);
  const barberUuid = canonicalBarberUuid(routine.barber_reference);
  const now = new Date();
  const activeStatuses = new Set(["booked", "checked_in", "in_service"]);
  const futureAppointments = directories.appointments
    .filter((row) => row.client_id === clientUuid && activeStatuses.has(row.status) && new Date(row.starts_at).getTime() > now.getTime())
    .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime());

  const alreadyLocked = futureAppointments.find((row) => row.barber_id === barberUuid);
  if (alreadyLocked) {
    return {
      status: "skipped",
      reason: "already_locked",
      appointmentId: alreadyLocked.reference_code ?? alreadyLocked.id,
      appointmentTime: alreadyLocked.starts_at,
      barberReference: routine.barber_reference,
      serviceReference: routine.service_reference ?? undefined,
      locationReference: directories.locations.find((row) => row.id === alreadyLocked.location_id)?.reference_code ?? undefined
    };
  }

  if (futureAppointments.length) {
    await writeRecommendation(supabase, {
      clientId: input.clientId,
      clientEmail: clientProfile.email,
      barberReference: routine.barber_reference,
      serviceReference: routine.service_reference ?? input.completedAppointment?.serviceReference ?? "",
      message: "Your routine is active, but you already have an upcoming appointment on the calendar.",
      remindAt: futureAppointments[0].starts_at,
      status: "skipped",
      reason: "existing_upcoming_appointment",
      metadata: {
        existingAppointmentReference: futureAppointments[0].reference_code ?? futureAppointments[0].id
      }
    });

    return {
      status: "skipped",
      reason: "existing_upcoming_appointment",
      appointmentId: futureAppointments[0].reference_code ?? futureAppointments[0].id,
      appointmentTime: futureAppointments[0].starts_at,
      barberReference: routine.barber_reference,
      serviceReference: routine.service_reference ?? undefined,
      locationReference: directories.locations.find((row) => row.id === futureAppointments[0].location_id)?.reference_code ?? undefined,
      recommendationStatus: "skipped"
    };
  }

  const clientPreference = await readClientPreference(supabase, input.clientId);
  const completedLocationReference = input.completedAppointment?.locationReference;
  const preferredLocationReference = clientPreference?.preferred_location_reference
    ?? clientPreference?.favorite_shop_reference
    ?? completedLocationReference
    ?? undefined;
  const targetDate = getTargetDate(routine, input.trigger, input.completedAppointment?.completedAt);
  const slotMatch = await findCanonicalBookableSlot(supabase, routine.barber_reference, {
    serviceId: routine.service_reference ?? input.completedAppointment?.serviceReference,
    preferredLocationId: preferredLocationReference,
    earliestAt: targetDate.toISOString(),
    days: Math.max(14, routine.average_cycle_days * 2)
  });

  const barberRow = directories.barbers.find((row) => row.id === barberUuid);
  const barberProfile = directories.profiles.find((row) => row.id === barberRow?.profile_id);
  const barberName = barberProfile?.full_name ?? routine.barber_reference;

  if (!slotMatch) {
    const serviceName = routine.service_reference
      ? directories.services.find((row) => (row.reference_code ?? row.id) === routine.service_reference)?.name ?? "your regular service"
      : "your regular service";
    const locationName = preferredLocationReference
      ? directories.locations.find((row) => (row.reference_code ?? row.id) === preferredLocationReference)?.name ?? "your regular shop"
      : "your regular shop";

    await updateRoutineWindow(supabase, routine, {
      nextSuggestedAt: targetDate.toISOString(),
      lastCompletedAt: input.completedAppointment?.completedAt ?? routine.last_completed_at,
      serviceReference: routine.service_reference ?? input.completedAppointment?.serviceReference ?? null
    });
    await writeRecommendation(supabase, {
      clientId: input.clientId,
      clientEmail: clientProfile.email,
      barberReference: routine.barber_reference,
      serviceReference: routine.service_reference ?? input.completedAppointment?.serviceReference ?? "",
      message: createRecommendationMessage({
        status: "suggested",
        barberName,
        serviceName,
        locationName
      }),
      remindAt: targetDate.toISOString(),
      status: "suggested",
      reason: "no_slot_available",
      metadata: {
        trigger: input.trigger,
        preferredLocationReference: preferredLocationReference ?? null
      }
    });

    return {
      status: "proposal_only",
      reason: "no_slot_available",
      barberReference: routine.barber_reference,
      serviceReference: routine.service_reference ?? input.completedAppointment?.serviceReference ?? undefined,
      locationReference: preferredLocationReference,
      recommendationStatus: "suggested"
    };
  }

  const serviceRow = directories.services.find((row) => (row.reference_code ?? row.id) === slotMatch.service.id);
  if (!serviceRow) {
    return {
      status: "skipped",
      reason: "missing_service"
    };
  }

  const locationRow = directories.locations.find((row) => (row.reference_code ?? row.id) === slotMatch.locationId);
  if (!locationRow) {
    return {
      status: "skipped",
      reason: "missing_preferred_location"
    };
  }

  const appointmentReference = buildAutoBookReference(input.clientId, routine.barber_reference, slotMatch.slot.startsAt);
  const appointmentId = canonicalAppointmentUuid(appointmentReference);
  const existingByReference = directories.appointments.find((row) => row.reference_code === appointmentReference);
  if (existingByReference) {
    return {
      status: "skipped",
      reason: "already_locked",
      appointmentId: appointmentReference,
      appointmentTime: existingByReference.starts_at,
      barberReference: routine.barber_reference,
      serviceReference: serviceRow.reference_code ?? serviceRow.id,
      locationReference: locationRow.reference_code ?? locationRow.id
    };
  }

  const createdAt = new Date().toISOString();
  const totalAmount = numeric(serviceRow.price);
  const depositAmount = totalAmount;
  const balanceDue = 0;
  const appointmentRow = {
    id: appointmentId,
    reference_code: appointmentReference,
    location_id: canonicalLocationUuid(slotMatch.locationId),
    barber_id: barberUuid,
    client_id: clientUuid,
    service_id: canonicalServiceUuid(serviceRow.reference_code ?? serviceRow.id),
    status: "booked",
    source: "booking",
    starts_at: slotMatch.slot.startsAt,
    ends_at: slotMatch.slot.endsAt,
    chair_label: "Routine hold",
    add_on_references: [] as string[],
    deposit_amount: depositAmount,
    total_amount: totalAmount,
    balance_due: balanceDue,
    tip_amount: 0,
    client_note: "Auto-book routine reserved this chair.",
    lifecycle_revision: 1,
    last_actor_role: "client",
    last_event_type: "booking",
    checkout_reference: null,
    updated_at: createdAt
  };

  const appointmentInsert = await supabase.from("appointments").insert(appointmentRow);
  if (appointmentInsert.error) {
    throw appointmentInsert.error;
  }

  const historyInsert = await supabase.from("appointment_status_history").insert({
    appointment_id: appointmentId,
    status: "booked",
    old_status: null,
    new_status: "booked",
    change_reason: "recurring_engine",
    changed_at: createdAt
  });
  if (historyInsert.error) {
    throw historyInsert.error;
  }

  const serviceSnapshotInsert = await supabase.from("appointment_services").insert({
    appointment_id: appointmentId,
    appointment_reference: appointmentReference,
    service_reference: serviceRow.reference_code ?? serviceRow.id,
    service_name: serviceRow.name,
    category: serviceRow.category,
    description: serviceRow.description,
    duration_min: serviceRow.duration_min,
    buffer_min: serviceRow.buffer_min,
    price: totalAmount,
    deposit_amount: depositAmount,
    full_prepay_required: serviceRow.full_prepay_required,
    add_on_references: [] as string[],
    snapshot_payload: {
      source: "recurring_engine",
      serviceReference: serviceRow.reference_code ?? serviceRow.id,
      capturedAt: createdAt
    },
    updated_at: createdAt
  });
  if (serviceSnapshotInsert.error) {
    throw serviceSnapshotInsert.error;
  }

  if (totalAmount > 0) {
    try {
      await createCapturedStripePaymentRecord(supabase, {
        appointmentId,
        clientId: clientUuid,
        shopId: canonicalLocationUuid(slotMatch.locationId),
        barberId: barberUuid,
        amount: totalAmount,
        paymentType: "booking",
        legacyType: "booking",
        legacyStatus: "captured",
        idempotencyKey: `recurring-booking:${appointmentReference}:${totalAmount.toFixed(2)}`,
        description: `BVRB3R recurring booking ${appointmentReference}`,
        metadata: {
          source: "recurring_engine",
          serviceReference: serviceRow.reference_code ?? serviceRow.id,
          trigger: input.trigger,
          appointmentReference
        },
        createdAt
      });
    } catch (error) {
      await supabase.from("appointment_services").delete().eq("appointment_id", appointmentId);
      await supabase.from("appointment_status_history").delete().eq("appointment_id", appointmentId);
      await supabase.from("appointments").delete().eq("id", appointmentId);
      throw error;
    }
  }

  const notificationsInsert = await supabase.from("notifications").insert([
    {
      channel: "sms",
      title: "Auto-book reserved your next visit",
      body: `Your routine locked ${serviceRow.name} with ${barberName} on ${new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(slotMatch.slot.startsAt))}.`,
      status: "scheduled",
      scheduled_for: createdAt,
      appointment_reference: appointmentReference,
      client_reference: input.clientId,
      barber_reference: routine.barber_reference,
      location_reference: locationRow.reference_code ?? locationRow.id,
      metadata: { audience: "client", eventType: "booking", source: "recurring_engine" },
      created_at: createdAt,
      updated_at: createdAt
    },
    {
      channel: "in_app",
      title: "Recurring booking added",
      body: `${clientProfile.fullName} now has a routine hold for ${serviceRow.name}.`,
      status: "scheduled",
      scheduled_for: createdAt,
      appointment_reference: appointmentReference,
      client_reference: input.clientId,
      barber_reference: routine.barber_reference,
      location_reference: locationRow.reference_code ?? locationRow.id,
      metadata: { audience: "barber", eventType: "booking", source: "recurring_engine" },
      created_at: createdAt,
      updated_at: createdAt
    }
  ]);
  if (notificationsInsert.error) {
    throw notificationsInsert.error;
  }

  const workflowEvent = {
    appointment_reference: appointmentReference,
    location_reference: locationRow.reference_code ?? locationRow.id,
    barber_reference: routine.barber_reference,
    barber_user_reference: barberRow?.profile_id ?? barberUuid,
    barber_email: barberProfile?.email ?? `${routine.barber_reference}@bvrb3r.local`,
    client_reference: input.clientId,
    client_email: clientProfile.email,
    actor_role: "client",
    event_type: "booking",
    title: "Auto-book reserved next appointment",
    detail: `${appointmentReference} reserved ${serviceRow.name} through the recurring routine engine`,
    event_payload: {
      appointmentStatus: "booked",
      source: "recurring_engine",
      balanceDue,
      totalAmount,
      tipAmount: 0,
      hasCheckout: false
    },
    created_at: createdAt
  };

  const workflowInsert = await supabase.from("workflow_events").insert(workflowEvent);
  if (workflowInsert.error) {
    throw workflowInsert.error;
  }

  const eventLogInsert = await supabase.from("event_log").upsert({
    appointment_reference: appointmentReference,
    location_reference: locationRow.reference_code ?? locationRow.id,
    barber_reference: routine.barber_reference,
    client_reference: input.clientId,
    actor_role: "client",
    event_type: "booking",
    title: "Auto-book reserved next appointment",
    detail: `${appointmentReference} reserved ${serviceRow.name} through the recurring routine engine`,
    payload: {
      appointmentStatus: "booked",
      source: "recurring_engine",
      balanceDue,
      totalAmount,
      tipAmount: 0,
      hasCheckout: false
    },
    created_at: createdAt
  }, { onConflict: "appointment_reference,event_type,created_at" });
  if (eventLogInsert.error) {
    throw eventLogInsert.error;
  }

  await updateRoutineWindow(supabase, routine, {
    nextSuggestedAt: slotMatch.slot.startsAt,
    lastCompletedAt: input.completedAppointment?.completedAt ?? routine.last_completed_at,
    serviceReference: serviceRow.reference_code ?? serviceRow.id,
    barberReference: routine.barber_reference
  });

  await writeRecommendation(supabase, {
    clientId: input.clientId,
    clientEmail: clientProfile.email,
    barberReference: routine.barber_reference,
    serviceReference: serviceRow.reference_code ?? serviceRow.id,
    message: createRecommendationMessage({
      status: "scheduled",
      barberName,
      serviceName: serviceRow.name,
      locationName: locationRow.name,
      startsAt: slotMatch.slot.startsAt
    }),
    remindAt: slotMatch.slot.startsAt,
    status: "scheduled",
    reason: "recurring_routine",
    metadata: {
      trigger: input.trigger,
      appointmentReference,
      autoBooked: true
    }
  });

  return {
    status: "booked",
    reason: "scheduled",
    appointmentId: appointmentReference,
    appointmentTime: slotMatch.slot.startsAt,
    barberReference: routine.barber_reference,
    serviceReference: serviceRow.reference_code ?? serviceRow.id,
    locationReference: locationRow.reference_code ?? locationRow.id,
    recommendationStatus: "scheduled"
  };
}






