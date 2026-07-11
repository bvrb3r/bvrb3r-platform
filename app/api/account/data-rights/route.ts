import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { currentLegalVersions } from "@/lib/legal/documents";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const requestSchema = z.object({
  requestType: z.enum(["deletion", "correction", "restriction", "objection"]),
  reason: z.string().trim().max(1000).optional().nullable(),
  confirmation: z.literal("CONFIRM")
});

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

async function safeSelect(
  supabase: AdminClient,
  table: string,
  column: string,
  value: string | null | undefined,
  select = "*"
) {
  if (!value) return [];
  const result = await supabase.from(table).select(select).eq(column, value);
  if (result.error) {
    return [{ unavailable: true, table, code: result.error.code ?? "query_failed" }];
  }
  return result.data ?? [];
}

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

  if (mode !== "export") {
    return NextResponse.json({ error: "Unsupported data-rights mode." }, { status: 400 });
  }

  const generatedAt = new Date().toISOString();
  const [profiles, clients, barbers, shops, appointmentsAsClient, appointmentsAsBarber, legalAcceptances, privacyPreferences, dataRightsRequests] = await Promise.all([
    safeSelect(supabase, "profiles", "id", user.id),
    safeSelect(supabase, "clients", "profile_id", user.id),
    safeSelect(supabase, "barbers", "profile_id", user.id),
    safeSelect(supabase, "shops", "owner_profile_id", user.id),
    safeSelect(supabase, "appointments", "client_id", user.clientId),
    safeSelect(supabase, "appointments", "barber_id", user.barberId),
    safeSelect(supabase, "compliance_acceptances", "user_id", user.id, "document_key, document_version, accepted_at"),
    safeSelect(supabase, "privacy_preferences", "profile_id", user.id),
    safeSelect(supabase, "data_rights_requests", "profile_id", user.id, "id, request_type, status, requested_at, acknowledged_at, completed_at, blocked_reason")
  ]);

  const body = {
    schemaVersion: 1,
    generatedAt,
    accountId: user.id,
    accountRole: user.role,
    legalVersions: currentLegalVersions(),
    data: {
      profiles,
      clients,
      barbers,
      shops,
      appointments: [...appointmentsAsClient, ...appointmentsAsBarber],
      legalAcceptances,
      privacyPreferences,
      dataRightsRequests
    },
    exclusions: [
      "payment credentials and full card data",
      "another user's private data",
      "internal security material",
      "provider secrets and authentication tokens"
    ]
  };

  await supabase.from("data_rights_requests").insert({
    profile_id: user.id,
    request_type: "export",
    status: "completed",
    requested_at: generatedAt,
    acknowledged_at: generatedAt,
    completed_at: generatedAt,
    request_metadata: { delivery: "inline_json", schema_version: 1 }
  });

  return new NextResponse(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="bvrb3r-data-export-${generatedAt.slice(0, 10)}.json"`,
      "cache-control": "private, no-store"
    }
  });
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
