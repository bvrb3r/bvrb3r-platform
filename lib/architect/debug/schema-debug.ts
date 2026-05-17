import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readArchitectDebugEnvironment } from "@/lib/architect/debug/env";
import type { ArchitectActor, ArchitectDebugPacket, JsonRecord } from "@/lib/architect/debug/types";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export async function buildSchemaDebugPacket(supabase: SupabaseClient, tableName: string, actor: ArchitectActor): Promise<ArchitectDebugPacket> {
  void actor;
  const result = await supabase
    .from("information_schema.columns")
    .select("column_name,data_type,udt_name,is_nullable,ordinal_position")
    .eq("table_name", tableName)
    .order("ordinal_position", { ascending: true });

  if (result.error) {
    throw new Error(result.error.message);
  }

  const columns = ((result.data ?? []) as JsonRecord[]) ?? [];
  const missing = columns.length === 0;
  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    debugType: "schema",
    targetType: "schema_table",
    targetId: tableName,
    environment: readArchitectDebugEnvironment(),
    summary: {
      health: missing ? "broken" : "healthy",
      diagnosisCode: missing ? "schema_table_missing" : "schema_columns_loaded",
      headline: missing ? `No schema columns were found for ${tableName}.` : `${columns.length} schema columns loaded for ${tableName}.`,
      confidence: "high",
      recommendedAction: missing ? "Verify table name or migration state." : "Use this schema truth before changing code.",
      canRepair: false,
      repairType: null,
      codexRequired: missing
    },
    entities: {
      appointment: null,
      client: null,
      clientProfile: null,
      barber: null,
      barberProfile: null,
      shop: null,
      service: null,
      payment: null,
      payments: [],
      paymentMethod: null,
      routing: { tableName, columns },
      routingRows: [],
      statusHistory: [],
      platformEvents: []
    },
    evidence: {
      databaseTruth: [{ label: "schema columns", status: missing ? "fail" : "pass", detail: `${columns.length} columns found.`, data: columns }],
      routeEvidence: [],
      schemaEvidence: [],
      logEvidence: [],
      userSymptom: null
    },
    diagnosis: {
      likelyRootCause: missing ? "Table was not found in information_schema." : "Schema evidence loaded.",
      affectedLayer: "database schema",
      failedInvariant: missing ? "expected table must exist" : "none",
      supportingFacts: [`${columns.length} columns returned for ${tableName}`],
      ruledOut: []
    },
    repairActions: [],
    codexPrompt: null,
    sqlSnippets: [{
      label: "Inspect table schema",
      sql: `select column_name,data_type,is_nullable from information_schema.columns where table_name = '${tableName.replaceAll("'", "''")}' order by ordinal_position;`
    }],
    validationChecklist: [],
    audit: { sessionId: null }
  };
}
