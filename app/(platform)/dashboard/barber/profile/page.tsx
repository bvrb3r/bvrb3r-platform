import { BarberProfileScreen } from "@/components/barber-experience/barber-profile-screen";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function BarberProfilePage({
  searchParams
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const user = await getAuthorizedUser(["commission_barber", "booth_rent_barber"]);
  const params = await searchParams;

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/barber/profile"
      title="Profile"
      subtitle="Preview the public barber identity clients trust: photo, bio, portfolio, services, reviews, and discovery-facing proof."
    >
      <BarberProfileScreen
        barberId={user.barberId}
        barberName={user.name}
        userEmail={user.email}
        initialSection={params.section}
      />
    </DashboardShell>
  );
}
