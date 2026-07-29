import { BarberCheckoutScreen } from "@/components/barber-experience/barber-checkout-screen";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function BarberCheckoutPage({
  searchParams
}: {
  searchParams: Promise<{ section?: string; appointmentId?: string }>;
}) {
  const user = await getAuthorizedUser(["barber_user"]);
  const params = await searchParams;

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/barber/checkout"
      title="Checkout"
      subtitle="Process payments & close out sales"
    >
      <BarberCheckoutScreen
        barberName={user.name}
        initialSection={params.section}
        appointmentId={params.appointmentId}
      />
    </DashboardShell>
  );
}
