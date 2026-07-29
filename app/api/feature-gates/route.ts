import { NextResponse } from "next/server";
import { applyFeatureFlagRows, GATES, type FeatureFlagRow } from "@/lib/feature-gates";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createSupabaseAdminClient();
  let rows: FeatureFlagRow[] = [];
  let source: "registry" | "supabase" = "registry";

  if (supabase) {
    const result = await supabase
      .from("feature_flags")
      .select("key, reason, enabled, plan_required")
      .in("key", Object.keys(GATES));

    if (!result.error) {
      rows = (result.data ?? []) as FeatureFlagRow[];
      source = "supabase";
    }
  }

  return NextResponse.json(
    {
      gates: applyFeatureFlagRows(rows),
      source
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0"
      }
    }
  );
}
