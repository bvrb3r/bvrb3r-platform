import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { requireArchitectAdmin } from "@/app/api/architect/verifications/_shared";
import { ensureClientProfileForUser } from "@/lib/booking/platform-service";
import { readClientPaymentMethodsByClientId } from "@/lib/payments/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ProfileRow = {
  id: string;
  role?: string | null;
  primary_onboarding_role?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ profileId: string }> }
) {
  try {
    const access = await requireArchitectAdmin();
    if (!access.ok) return access.response;

    const { profileId } = await params;
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase admin client is unavailable." }, { status: 503 });
    }

    const profileRead = await supabase
      .from("profiles")
      .select("id, role, primary_onboarding_role, full_name, email, phone")
      .eq("id", profileId)
      .maybeSingle();

    if (profileRead.error) {
      return NextResponse.json({ error: profileRead.error.message }, { status: 500 });
    }

    const profile = profileRead.data as ProfileRow | null;
    const role = profile?.primary_onboarding_role ?? profile?.role ?? "client";
    if (role !== "client") {
      return NextResponse.json({ error: "Only client accounts can repair client payment profiles." }, { status: 403 });
    }

    const repair = await ensureClientProfileForUser({
      userId: profileId,
      clientId: undefined,
      role: "client",
      email: profile?.email,
      fullName: profile?.full_name,
      phone: profile?.phone
    });
    const methods = await readClientPaymentMethodsByClientId(repair.clientId, supabase, {
      profileId,
      clientReference: repair.clientId,
      profileEmail: profile?.email,
      profileName: profile?.full_name,
      profilePhone: profile?.phone
    });

    revalidatePath(`/architect/users/${profileId}`);
    revalidatePath("/dashboard/client/profile");
    revalidatePath("/booking/new");
    revalidatePath("/dashboard/client");

    return NextResponse.json({
      ok: true,
      repair,
      paymentMethodCount: methods.length,
      defaultPaymentExists: methods.some((method) => method.isDefault)
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to repair client payment profile."
    }, { status: 500 });
  }
}
