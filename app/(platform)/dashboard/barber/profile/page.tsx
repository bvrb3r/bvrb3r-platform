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
      subtitle="Control the full barber identity here: public profile, discovery media, reviews, and the private setup that keeps the chair live."
    >
      <BarberProfileScreen
        user={user}
        initialSection={params.section}
      />
    </DashboardShell>
  );
}
