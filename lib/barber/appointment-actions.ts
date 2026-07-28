import { isBarberAccountRole } from "@/lib/auth/roles";
import { canonicalAppointmentUuid } from "@/lib/booking/canonical-booking";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { UserAccount } from "@/types/domain";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

type BarberAppointmentActionRow = {
  id: string;
  reference_code: string | null;
  barber_id: string;
  status: string;
  lifecycle_revision: number | null;
};

export class BarberAppointmentActionError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "BarberAppointmentActionError";
  }
}

async function resolveProfile(supabase: SupabaseClient, user: UserAccount) {
  const byId = user.id
    ? await supabase
      .from("profiles")
      .select("id, email, role")
      .eq("id", user.id)
      .maybeSingle()
    : { data: null, error: null };

  if (byId.error) {
    throw new BarberAppointmentActionError("Unable to resolve barber profile.", 500);
  }
  if (byId.data) {
    return byId.data as { id: string; email: string | null; role: string | null };
  }

  const byEmail = await supabase
    .from("profiles")
    .select("id, email, role")
    .eq("email", user.email)
    .maybeSingle();

  if (byEmail.error) {
    throw new BarberAppointmentActionError("Unable to resolve barber profile.", 500);
  }
  if (!byEmail.data) {
    throw new BarberAppointmentActionError("No barber profile is available for this account.", 403);
  }

  return byEmail.data as { id: string; email: string | null; role: string | null };
}

async function resolveAppointment(supabase: SupabaseClient, appointmentId: string) {
  const trimmed = appointmentId.trim();
  const query = UUID_PATTERN.test(trimmed)
    ? supabase
      .from("appointments")
      .select("id, reference_code, barber_id, status, lifecycle_revision")
      .eq("id", trimmed)
    : supabase
      .from("appointments")
      .select("id, reference_code, barber_id, status, lifecycle_revision")
      .eq("reference_code", trimmed);
  const primary = await query.maybeSingle();

  if (primary.error) {
    throw new BarberAppointmentActionError("Unable to load appointment.", 500);
  }
  if (primary.data) {
    return primary.data as BarberAppointmentActionRow;
  }

  if (!UUID_PATTERN.test(trimmed)) {
    const canonical = await supabase
      .from("appointments")
      .select("id, reference_code, barber_id, status, lifecycle_revision")
      .eq("id", canonicalAppointmentUuid(trimmed))
      .maybeSingle();

    if (canonical.error) {
      throw new BarberAppointmentActionError("Unable to load canonical appointment.", 500);
    }
    if (canonical.data) {
      return canonical.data as BarberAppointmentActionRow;
    }
  }

  throw new BarberAppointmentActionError("Appointment was not found.", 404);
}

export async function resolveBarberAppointmentActionContext(input: {
  user: UserAccount;
  appointmentId: string;
  allowedStatuses: string[];
}) {
  if (!isBarberAccountRole(input.user.role)) {
    throw new BarberAppointmentActionError("Appointment does not belong to this barber.", 403);
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new BarberAppointmentActionError("Barber appointment actions are unavailable.", 503);
  }

  const profile = await resolveProfile(supabase, input.user);
  const barberResult = await supabase
    .from("barbers")
    .select("id, reference_code, barber_subtype")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (barberResult.error) {
    throw new BarberAppointmentActionError("Unable to resolve barber appointment ownership.", 500);
  }
  if (!barberResult.data) {
    throw new BarberAppointmentActionError("Appointment does not belong to this barber.", 403);
  }

  const barber = barberResult.data as { id: string; reference_code: string | null; barber_subtype: string | null };
  const appointment = await resolveAppointment(supabase, input.appointmentId);

  if (appointment.barber_id !== barber.id) {
    throw new BarberAppointmentActionError("Appointment does not belong to this barber.", 403);
  }

  if (!input.allowedStatuses.includes(appointment.status)) {
    throw new BarberAppointmentActionError("Appointment cannot move to this status from its current state.", 409);
  }

  return {
    profile,
    barber,
    appointment,
    providerAppointmentId: appointment.reference_code ?? appointment.id,
    relationshipType: barber.barber_subtype === "autobooth_rent" || barber.barber_subtype === "booth_rent"
      ? barber.barber_subtype
      : "freelance"
  };
}
