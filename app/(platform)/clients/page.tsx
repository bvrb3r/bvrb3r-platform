import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { BarberClientsWorkspace } from "@/components/operations/barber-clients-workspace";
import { Card } from "@/components/ui/card";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function ClientsPage() {
  const user = await getAuthorizedUser(["owner", "manager", "front_desk", "commission_barber", "booth_rent_barber"]);
  const isBarber = user.role === "commission_barber" || user.role === "booth_rent_barber";

  if (isBarber) {
    return (
      <DashboardShell
        user={user}
        activeHref="/clients"
        title="Client relationships and notes"
        subtitle="See your guests in one sortable roster so spend, repeat value, and last visit stay clear before the next appointment."
      >
        <BarberClientsWorkspace barberName={user.name} />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell user={user} activeHref="/clients" title="Client records and relationships" subtitle="Profiles, retention tags, notes, and service history stay visible for leadership and front desk operations.">
      <Card className="rounded-[32px] p-5 sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="surface-label">Client roster</p>
            <p className="mt-2 max-w-2xl text-sm text-white/58">Scan relationships, notes, and retention status without exposing unrelated financial tools.</p>
          </div>
          <span className="status-pill text-[#d7ffab]">Role-safe records</span>
        </div>
        <div className="rounded-[28px] border border-dashed border-white/10 bg-black/20 p-6 text-sm leading-6 text-white/58">
          No client records are linked to this account yet. Real clients, notes, loyalty, and visit history will appear here only after platform activity creates them.
        </div>
      </Card>
    </DashboardShell>
  );
}
