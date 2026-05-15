import { BarberProfileScreen } from "@/components/barber-experience/barber-profile-screen";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { BarberProfileRepairError, ensureBarberProfileForUser } from "@/lib/barber/profile-repair";
import { syncOnboardingBarberServicesForUser } from "@/lib/marketplace/service-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function BarberProfilePage({
  searchParams
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const user = await getAuthorizedUser(["barber_user"]);
  const params = await searchParams;
  const repairResult = await ensureBarberProfileForUser({
    userId: user.id,
    barberId: user.barberId,
    role: user.role,
    email: user.email,
    fullName: user.name,
    phone: user.phone,
    preferredUsername: user.barberId,
    appApprovalStatus: user.appApprovalStatus
  }).then((result) => ({ result, error: null as string | null })).catch((error) => ({
    result: null,
    error: error instanceof BarberProfileRepairError
      ? error.reason
      : error instanceof Error
        ? error.message
        : "unknown"
  }));
  const effectiveUser = repairResult.result
    ? { ...user, barberId: repairResult.result.barberReference }
    : user;
  const supabase = createSupabaseAdminClient();
  if (supabase) {
    await syncOnboardingBarberServicesForUser(supabase, user.id).catch((error) => {
      console.error("[barber-profile-page] onboarding service sync failed", {
        userId: user.id,
        message: error instanceof Error ? error.message : String(error)
      });
    });
  }

  return (
    <DashboardShell
      user={effectiveUser}
      activeHref="/dashboard/barber/profile"
      title="Profile"
      subtitle="Manage your profile & brand"
    >
      <BarberProfileScreen
        user={effectiveUser}
        initialSection={params.section}
        profileRepairFeedback={repairResult.result?.message ?? repairResult.error ?? undefined}
      />
    </DashboardShell>
  );
}
