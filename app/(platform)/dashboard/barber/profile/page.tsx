import { BarberProfileScreen } from "@/components/barber-experience/barber-profile-screen";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { BarberProfileRepairError, ensureBarberProfileForUser } from "@/lib/barber/profile-repair";

export default async function BarberProfilePage({
  searchParams
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const user = await getAuthorizedUser(["commission_barber", "booth_rent_barber"]);
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
