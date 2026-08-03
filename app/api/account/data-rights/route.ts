import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const requestSchema = z.object({
  requestType: z.enum(["deletion", "correction", "restriction", "objection"]),
  reason: z.string().trim().max(1000).optional().nullable(),
  confirmation: z.literal("CONFIRM")
});

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user.id || user.id === "guest-user") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "status";
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Data-rights services are unavailable." }, { status: 503 });
  }

  if (mode === "status") {
    const result = await supabase
      .from("data_rights_requests")
      .select("id, request_type, status, requested_at, acknowledged_at, completed_at, blocked_reason, updated_at")
      .eq("profile_id", user.id)
      .order("requested_at", { ascending: false })
      .limit(25);

    if (result.error) {
      return NextResponse.json({ error: "Unable to load data-rights requests." }, { status: 500 });
    }
    return NextResponse.json({ requests: result.data ?? [] });
  }

  if (mode === "export") {
    return NextResponse.json({
      error: "Request the private emailed export from Account Privacy.",
      code: "export_delivery_requires_request",
      requestEndpoint: "/api/account/privacy-controls"
    }, { status: 409 });
  }

  if (mode !== "status") {
    return NextResponse.json({ error: "Unsupported data-rights mode." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user.id || user.id === "guest-user") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data-rights request." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Data-rights services are unavailable." }, { status: 503 });
  }

  const requestedAt = new Date().toISOString();
  const result = await supabase
    .from("data_rights_requests")
    .insert({
      profile_id: user.id,
      request_type: parsed.data.requestType,
      status: "pending",
      requested_at: requestedAt,
      request_metadata: {
        reason: parsed.data.reason || null,
        account_role: user.role,
        source: "authenticated_api"
      }
    })
    .select("id, request_type, status, requested_at")
    .single();

  if (result.error) {
    if (result.error.code === "23505" && parsed.data.requestType === "deletion") {
      return NextResponse.json(
        { error: "An account-deletion request is already open.", code: "deletion_request_already_open" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Unable to create data-rights request." }, { status: 500 });
  }

  return NextResponse.json({ request: result.data }, { status: 201 });
}
