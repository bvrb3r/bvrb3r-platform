import { createHash } from "node:crypto";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { LiveAppointmentRecord } from "@/lib/operations/live-state";
import type { Role } from "@/types/domain";

type NotificationPreferenceRow = {
  role: Role;
  user_email: string;
  client_reference: string | null;
  barber_reference: string | null;
  in_app_enabled: boolean | null;
};

type BookingNotificationInput = {
  appointment: LiveAppointmentRecord;
  clientName: string;
  clientEmail?: string | null;
  barberName?: string | null;
  serviceName?: string | null;
  startsAt?: string | null;
};

function stableNotificationId(seed: string) {
  return `booking-${createHash("sha1").update(seed).digest("hex").slice(0, 24)}`;
}

function formatAppointmentTime(iso?: string | null) {
  if (!iso) {
    return "the selected time";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "the selected time";
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

async function readPreference(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  column: "client_reference" | "barber_reference",
  value: string
) {
  const result = await supabase
    .from("notification_preferences")
    .select("role, user_email, client_reference, barber_reference, in_app_enabled")
    .eq(column, value)
    .limit(1);

  if (result.error) {
    throw result.error;
  }

  return (result.data?.[0] ?? null) as NotificationPreferenceRow | null;
}

export async function queueBookingCreatedNotifications(input: BookingNotificationInput) {
  if (!isSupabaseEnabled()) {
    return { queued: 0, skipped: true };
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return { queued: 0, skipped: true };
  }

  const [clientPreference, barberPreference] = await Promise.all([
    readPreference(supabase, "client_reference", input.appointment.clientId),
    readPreference(supabase, "barber_reference", input.appointment.barberId)
  ]);

  const appointmentTime = formatAppointmentTime(input.startsAt ?? input.appointment.start);
  const serviceName = input.serviceName?.trim() || input.appointment.serviceId;
  const barberName = input.barberName?.trim() || input.appointment.barberId;
  const createdAt = new Date().toISOString();
  const rows = [];

  if ((clientPreference?.in_app_enabled ?? true) && (clientPreference?.user_email || input.clientEmail)) {
    rows.push({
      audience_role: clientPreference?.role ?? "client",
      audience_email: clientPreference?.user_email ?? input.clientEmail,
      client_reference: input.appointment.clientId,
      client_email: clientPreference?.user_email ?? input.clientEmail,
      barber_reference: input.appointment.barberId,
      barber_email: null,
      location_reference: input.appointment.locationId,
      channel: "in_app",
      notification_type: "booking_alert",
      title: "Appointment confirmed",
      body: `Appointment confirmed with ${barberName} for ${serviceName} on ${appointmentTime}.`,
      status: "queued",
      metadata: {
        source: "booking_created",
        appointmentId: input.appointment.id
      },
      created_at: createdAt,
      scheduled_for: null,
      dedupe_key: stableNotificationId(`client:${input.appointment.id}`)
    });
  }

  if ((barberPreference?.in_app_enabled ?? true) && barberPreference?.user_email) {
    rows.push({
      audience_role: barberPreference.role,
      audience_email: barberPreference.user_email,
      client_reference: input.appointment.clientId,
      client_email: input.clientEmail ?? null,
      barber_reference: input.appointment.barberId,
      barber_email: barberPreference.user_email,
      location_reference: input.appointment.locationId,
      channel: "in_app",
      notification_type: "booking_alert",
      title: "New appointment booked",
      body: `New appointment booked: ${input.clientName}, ${serviceName}, ${appointmentTime}.`,
      status: "queued",
      metadata: {
        source: "booking_created",
        appointmentId: input.appointment.id
      },
      created_at: createdAt,
      scheduled_for: null,
      dedupe_key: stableNotificationId(`barber:${input.appointment.id}`)
    });
  }

  if (!rows.length) {
    return { queued: 0, skipped: true };
  }

  const write = await supabase.from("notifications").upsert(rows, {
    onConflict: "dedupe_key"
  });
  if (write.error) {
    throw write.error;
  }

  return { queued: rows.length, skipped: false };
}
