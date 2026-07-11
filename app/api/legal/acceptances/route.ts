import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { LEGAL_DOCUMENTS, REQUIRED_ACCOUNT_AGREEMENTS } from "@/lib/legal/documents";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const acceptanceSchema = z.object({
  documentKey: z.enum(["terms", "privacy", "community_guidelines"]),
  documentVersion: z.string().trim().min(1).max(64),
  accepted: z.literal(true)
});

function currentDocument(documentKey: z.infer<typeof acceptanceSchema>["documentKey"]) {
  return Object.values(LEGAL_DOCUMENTS).find((document) => document.key === documentKey) ?? null;
}

function requestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user.id || user.id === "guest-user") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Legal acceptance storage is unavailable." }, { status: 503 });
  }

  const result = await supabase
    .from("compliance_acceptances")
    .select("document_key, document_version, accepted_at")
    .eq("user_id", user.id)
    .in("document_key", REQUIRED_ACCOUNT_AGREEMENTS.map((document) => document.key));

  if (result.error) {
    return NextResponse.json({ error: "Unable to load legal acceptance status." }, { status: 500 });
  }

  const accepted = new Map((result.data ?? []).map((row) => [`${row.document_key}:${row.document_version}`, row]));
  const requirements = REQUIRED_ACCOUNT_AGREEMENTS.map((document) => ({
    ...document,
    accepted: accepted.has(`${document.key}:${document.version}`),
    acceptedAt: accepted.get(`${document.key}:${document.version}`)?.accepted_at ?? null
  }));

  return NextResponse.json({ requirements, reacceptanceRequired: requirements.some((document) => !document.accepted) });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user.id || user.id === "guest-user") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const parsed = acceptanceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid legal acceptance payload." }, { status: 400 });
  }

  const document = currentDocument(parsed.data.documentKey);
  if (!document || document.version !== parsed.data.documentVersion) {
    return NextResponse.json(
      { error: "The legal document version is no longer current.", code: "legal_reacceptance_required" },
      { status: 409 }
    );
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Legal acceptance storage is unavailable." }, { status: 503 });
  }

  const acceptedAt = new Date().toISOString();
  const result = await supabase.from("compliance_acceptances").insert({
    user_id: user.id,
    account_role: user.role,
    document_key: document.key,
    document_version: document.version,
    accepted_at: acceptedAt,
    ip_address: requestIp(request),
    user_agent: request.headers.get("user-agent")
  });

  if (result.error) {
    const duplicate = result.error.code === "23505";
    if (!duplicate) {
      return NextResponse.json({ error: "Unable to record legal acceptance." }, { status: 500 });
    }
  }

  return NextResponse.json({ accepted: true, documentKey: document.key, documentVersion: document.version, acceptedAt });
}
