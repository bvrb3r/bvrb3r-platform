import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hashAccountExportToken } from "@/lib/trust/account-data-export";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const user = await getSessionUser();
  if (!user.id || user.id === "guest-user") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { token } = await context.params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return NextResponse.json({ error: "This export link is invalid." }, { status: 404 });
  }
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Data export is unavailable." }, { status: 503 });
  }

  const archiveResult = await supabase
    .schema("compliance_private")
    .from("account_export_archives")
    .select("delivery_id, profile_id, archive_payload, expires_at")
    .eq("token_hash", hashAccountExportToken(token))
    .eq("profile_id", user.id)
    .maybeSingle();
  if (archiveResult.error || !archiveResult.data) {
    return NextResponse.json({ error: "This export link is invalid or no longer available." }, { status: 404 });
  }

  if (new Date(archiveResult.data.expires_at) <= new Date()) {
    await Promise.all([
      supabase
        .from("account_export_deliveries")
        .update({ status: "expired" })
        .eq("id", archiveResult.data.delivery_id),
      supabase
        .schema("compliance_private")
        .from("account_export_archives")
        .delete()
        .eq("delivery_id", archiveResult.data.delivery_id)
    ]);
    return NextResponse.json({ error: "This export link expired. Request a new export." }, { status: 410 });
  }

  await supabase
    .from("account_export_deliveries")
    .update({ downloaded_at: new Date().toISOString() })
    .eq("id", archiveResult.data.delivery_id);

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(archiveResult.data.archive_payload, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="bvrb3r-data-export-${date}.json"`,
      "cache-control": "private, no-store, max-age=0",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff"
    }
  });
}
