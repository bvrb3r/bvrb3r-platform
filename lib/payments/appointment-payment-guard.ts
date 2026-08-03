import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export class AppointmentPaymentGuardError extends Error {
  constructor(
    message: string,
    public status = 409,
    public code = "appointment_payment_blocked"
  ) {
    super(message);
    this.name = "AppointmentPaymentGuardError";
  }
}

export type AppointmentPaymentGuardView = {
  appointmentId: string;
  clientId: string;
  clientProfileId: string | null;
  shopId: string | null;
  locationId: string;
  depositAmount: number;
};

type PaymentGuardClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function requireShopPaymentAllowed(input: {
  shopId?: string | null;
  locationId?: string | null;
}, client?: PaymentGuardClient) {
  const shopId = input.shopId?.trim() || null;
  const rawLocationId = input.locationId?.trim() || shopId;
  const locationId = rawLocationId && UUID_PATTERN.test(rawLocationId) ? rawLocationId : null;
  if (!shopId && !locationId) return;

  const supabase = client ?? createSupabaseAdminClient();
  if (!supabase) {
    throw new AppointmentPaymentGuardError(
      "Payment safety could not reach live shop truth.",
      503,
      "shop_payment_truth_unavailable"
    );
  }
  const allowedResult = await supabase.rpc("pr36_shop_payment_allowed", {
    p_shop_id: shopId,
    p_location_id: locationId
  });
  if (allowedResult.error) {
    throw new AppointmentPaymentGuardError(
      "Payment safety could not verify shop launch state.",
      503,
      "shop_launch_preflight_failed"
    );
  }
  if (allowedResult.data !== true) {
    throw new AppointmentPaymentGuardError(
      "This shop is not open yet, so no payment can be taken.",
      409,
      "shop_not_open_for_payment"
    );
  }
}

/**
 * Runs before any Stripe intent is created. The database remains the final
 * enforcement layer, while this preflight prevents provider-side money from
 * being authorized for a shop that has not opened yet.
 */
export async function requireAppointmentPaymentAllowed(input: {
  appointmentId: string;
  expectedClientProfileId?: string | null;
}, client?: PaymentGuardClient): Promise<AppointmentPaymentGuardView> {
  const supabase = client ?? createSupabaseAdminClient();
  if (!supabase) {
    throw new AppointmentPaymentGuardError(
      "Payment safety could not reach live appointment truth.",
      503,
      "appointment_payment_truth_unavailable"
    );
  }

  const appointmentResult = await supabase
    .from("appointments")
    .select("id, client_id, shop_id, location_id, deposit_amount")
    .eq("id", input.appointmentId)
    .maybeSingle();
  if (appointmentResult.error) {
    throw new AppointmentPaymentGuardError(
      "Payment safety could not verify this appointment.",
      503,
      "appointment_payment_preflight_failed"
    );
  }
  if (!appointmentResult.data) {
    throw new AppointmentPaymentGuardError("Appointment not found.", 404, "appointment_not_found");
  }

  const appointment = appointmentResult.data as {
    id: string;
    client_id: string;
    shop_id: string | null;
    location_id: string;
    deposit_amount: number | string | null;
  };
  const clientResult = await supabase
    .from("clients")
    .select("profile_id")
    .eq("id", appointment.client_id)
    .maybeSingle();
  if (clientResult.error) {
    throw new AppointmentPaymentGuardError(
      "Payment safety could not verify the appointment client.",
      503,
      "appointment_client_preflight_failed"
    );
  }
  const clientProfileId = (clientResult.data?.profile_id as string | null | undefined) ?? null;
  if (input.expectedClientProfileId && clientProfileId !== input.expectedClientProfileId) {
    throw new AppointmentPaymentGuardError(
      "Only the appointment client can initialize this payment.",
      403,
      "appointment_client_mismatch"
    );
  }

  await requireShopPaymentAllowed({
    shopId: appointment.shop_id,
    locationId: appointment.location_id
  }, supabase);

  return {
    appointmentId: appointment.id,
    clientId: appointment.client_id,
    clientProfileId,
    shopId: appointment.shop_id,
    locationId: appointment.location_id,
    depositAmount: Math.max(0, Number(appointment.deposit_amount ?? 0))
  };
}
