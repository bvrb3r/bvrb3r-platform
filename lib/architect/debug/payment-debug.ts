import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildAppointmentDebugPacket } from "@/lib/architect/debug/appointment-debug";
import type { ArchitectActor, JsonRecord } from "@/lib/architect/debug/types";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export async function buildPaymentDebugPacket(
  supabase: SupabaseClient,
  input: { appointmentId?: string | null; paymentId?: string | null },
  actor: ArchitectActor
) {
  if (input.appointmentId) {
    return buildAppointmentDebugPacket(supabase, input.appointmentId, actor, { debugType: "payment" });
  }

  if (!input.paymentId) {
    throw new Error("appointmentId or paymentId is required.");
  }

  const paymentResult = await supabase
    .from("payments")
    .select("id,appointment_id")
    .eq("id", input.paymentId)
    .maybeSingle();

  if (paymentResult.error) {
    throw new Error(paymentResult.error.message);
  }

  const payment = paymentResult.data as JsonRecord | null;
  return buildAppointmentDebugPacket(supabase, String(payment?.appointment_id ?? ""), actor, { debugType: "payment" });
}
