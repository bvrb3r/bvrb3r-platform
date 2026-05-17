import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildAppointmentDebugPacket } from "@/lib/architect/debug/appointment-debug";
import type { ArchitectActor } from "@/lib/architect/debug/types";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export async function buildBookingLoopDebugPacket(supabase: SupabaseClient, appointmentId: string, actor: ArchitectActor) {
  const packet = await buildAppointmentDebugPacket(supabase, appointmentId, actor, { debugType: "booking_loop" });
  packet.validationChecklist = [
    { stage: "client_profile", status: packet.entities.clientProfile ? "pass" : "fail", reason: packet.entities.clientProfile ? undefined : "client profile missing" },
    { stage: "barber_profile", status: packet.entities.barberProfile ? "pass" : "fail", reason: packet.entities.barberProfile ? undefined : "barber profile missing" },
    { stage: "service", status: packet.entities.service ? "pass" : "fail", reason: packet.entities.service ? undefined : "service missing" },
    { stage: "appointment_inserted", status: packet.entities.appointment ? "pass" : "fail", reason: packet.entities.appointment ? undefined : "appointment missing" },
    { stage: "payment_captured", status: packet.entities.payment ? "pass" : "fail", reason: packet.entities.payment ? undefined : "payment missing" },
    { stage: "status_history", status: packet.entities.statusHistory.length ? "pass" : "warning", reason: packet.entities.statusHistory.length ? undefined : "history missing" },
    { stage: "routing_eligible", status: String(packet.entities.routing?.payout_readiness_status ?? "").toLowerCase() === "eligible" ? "pass" : "fail", reason: packet.entities.routing ? "routing not eligible" : "routing missing" },
    { stage: "payout_not_released", status: !packet.entities.routing?.released_at ? "pass" : "fail", reason: packet.entities.routing?.released_at ? "released_at populated" : undefined }
  ];
  return packet;
}
