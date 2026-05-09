import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { requireArchitectAdmin } from "@/app/api/architect/verifications/_shared";
import {
  BarberProfileRepairError,
  ensureBarberProfileForUser
} from "@/lib/barber/profile-repair";
import { getCanonicalMarketplaceEligibility } from "@/lib/booking/intelligence";
import { publishBarberMarketplaceReadiness } from "@/lib/marketplace/publishing";
import { syncOnboardingBarberServicesForUser } from "@/lib/marketplace/service-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createEmptyTrustState } from "@/lib/trust/engine";
import { getTrustProvider } from "@/lib/trust/provider";

type ProfileRow = {
  id: string;
  role?: string | null;
  primary_onboarding_role?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

async function readTrustStateSafe() {
  try {
    const provider = await getTrustProvider();
    return provider.readState();
  } catch {
    return createEmptyTrustState();
  }
}

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
    const result = await ensureBarberProfileForUser({
      userId: profileId,
      role: profile?.primary_onboarding_role ?? profile?.role ?? "barber",
      email: profile?.email,
      fullName: profile?.full_name,
      phone: profile?.phone,
      preferredUsername: undefined
    }, supabase);
    const serviceSync = await syncOnboardingBarberServicesForUser(supabase, profileId);
    const barberReference = result.canonical.barberReference;
    const publishResult = await publishBarberMarketplaceReadiness(supabase, barberReference);
    const trustState = await readTrustStateSafe();
    const eligibility = await getCanonicalMarketplaceEligibility(supabase, barberReference, {
      trustState,
      directSearchQuery: "phillip"
    });

    revalidatePath(`/architect/users/${profileId}`);
    revalidatePath("/dashboard/client");
    revalidatePath("/dashboard/client/search");
    revalidatePath(`/barber/${result.username}`);

    return NextResponse.json({
      ok: true,
      repair: {
        success: result.success,
        repaired: result.repaired,
        message: result.message,
        canonical: result.canonical,
        readChecks: result.readChecks
      },
      serviceSync,
      publishResult,
      eligibility
    });
  } catch (error) {
    const status = error instanceof BarberProfileRepairError && error.reason === "role_not_barber" ? 403 : 409;
    return NextResponse.json({
      error: error instanceof BarberProfileRepairError ? error.reason : "barber_profile_repair_failed",
      message: error instanceof Error ? error.message : String(error),
      repairDetails: error instanceof BarberProfileRepairError ? error.details ?? null : null
    }, { status });
  }
}
