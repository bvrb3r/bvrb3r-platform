import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ArchitectActor, ArchitectRepairSafetyClass, JsonRecord } from "@/lib/architect/debug/types";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export async function writeArchitectRepairAudit(
  supabase: SupabaseClient,
  input: {
    actor: ArchitectActor;
    repairType: string;
    targetType: string;
    targetId: string;
    safetyClass: ArchitectRepairSafetyClass;
    beforeSnapshot?: JsonRecord | null;
    afterSnapshot?: JsonRecord | null;
    payload?: JsonRecord | null;
    result: "previewed" | "succeeded" | "failed" | "skipped";
    errorCode?: string | null;
    errorMessageSafe?: string | null;
    postgresCode?: string | null;
    postgresDetails?: string | null;
  }
) {
  const result = await supabase
    .from("architect_repair_audit_logs")
    .insert({
      actor_profile_id: input.actor.id,
      actor_email: input.actor.email,
      repair_type: input.repairType,
      target_type: input.targetType,
      target_id: input.targetId,
      safety_class: input.safetyClass,
      before_snapshot: input.beforeSnapshot ?? null,
      after_snapshot: input.afterSnapshot ?? null,
      payload: input.payload ?? null,
      result: input.result,
      error_code: input.errorCode ?? null,
      error_message_safe: input.errorMessageSafe ?? null,
      postgres_code: input.postgresCode ?? null,
      postgres_details: input.postgresDetails ?? null
    })
    .select("id")
    .single();

  if (result.error) {
    console.warn("[architect-repair] audit write failed", {
      repairType: input.repairType,
      targetId: input.targetId,
      errorMessage: result.error.message
    });
    return null;
  }

  return String((result.data as JsonRecord).id);
}
