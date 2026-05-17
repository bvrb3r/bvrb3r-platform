import { NextResponse } from "next/server";
import { buildSchemaDebugPacket } from "@/lib/architect/debug/schema-debug";
import { requireArchitectDebugAccess } from "@/lib/architect/debug/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) return access.response;

  const table = new URL(request.url).searchParams.get("table")?.trim();
  if (!table) {
    return NextResponse.json({ ok: false, error: "table is required.", safeMessage: "Enter a table name.", stage: "input" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase admin client is unavailable.", safeMessage: "Production database access is unavailable.", stage: "supabase" }, { status: 503 });
  }

  try {
    const packet = await buildSchemaDebugPacket(supabase, table, access.actor);
    return NextResponse.json(packet);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to inspect schema.",
      safeMessage: "Schema debug could not be completed.",
      stage: "schema_debug"
    }, { status: 500 });
  }
}
