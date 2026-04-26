import { BarberCheckoutScreen } from "@/components/barber-experience/barber-checkout-screen";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function BarberCheckoutPage({
  searchParams
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const user = await getAuthorizedUser(["commission_barber", "booth_rent_barber"]);
  const params = await searchParams;

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/barber/checkout"
      title="Checkout"
      subtitle="Charge clients, close appointments, and track payments."
    >
      <BarberCheckoutScreen
        barberName={user.name}
        barberRole={user.role as "commission_barber" | "booth_rent_barber"}
        initialSection={params.section}
      />
    </DashboardShell>
  );
}
