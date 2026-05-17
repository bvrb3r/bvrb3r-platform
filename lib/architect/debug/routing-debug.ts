import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildAppointmentDebugPacket } from "@/lib/architect/debug/appointment-debug";
import type { ArchitectActor } from "@/lib/architect/debug/types";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export async function buildRoutingDebugPacket(supabase: SupabaseClient, appointmentId: string, actor: ArchitectActor) {
  return buildAppointmentDebugPacket(supabase, appointmentId, actor, { debugType: "routing" });
}
