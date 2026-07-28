import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { RentWorkspace } from "@/components/rent/rent-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function BarberRentPage({
  searchParams
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await getAuthorizedUser([
    "barber_user",
    "barber",
    "freelance_barber",
    "booth_rent_barber"
  ]);
  const { view } = await searchParams;
  const initialView = view === "autobooth" ? "autobooth" : "rent";

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/barber/rent"
      title="Booth Rent"
      subtitle="Fixed obligation, private earnings, rent only"
      hidePageHeader
    >
      <RentWorkspace viewer="barber" initialView={initialView} />
    </DashboardShell>
  );
}
