import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { BarberScheduleWorkspace } from "@/components/operations/barber-schedule-workspace";
import { OwnerScheduleWorkspace } from "@/components/operations/owner-schedule-workspace";
import { Card } from "@/components/ui/card";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { demoAppointments, demoWalkIns } from "@/lib/data/demo";
import { dateLabel } from "@/lib/utils";

export default async function AppointmentsPage() {
  const user = await getAuthorizedUser(["owner", "manager", "front_desk", "commission_barber", "booth_rent_barber"]);
  const isBarber = user.role === "commission_barber" || user.role === "booth_rent_barber";

  if (isBarber) {
    return (
      <DashboardShell
        user={user}
        activeHref="/appointments"
        title="Appointments and availability"
        subtitle="Run your chair schedule, availability, and same-day appointment actions from one barber-safe timeline."
      >
        <BarberScheduleWorkspace barberName={user.name} />
      </DashboardShell>
    );
  }

  if (user.role === "owner") {
    return (
      <DashboardShell
        user={user}
        activeHref="/appointments"
        title="Shop schedule"
        subtitle="See every chair, every gap, and every live appointment from one owner-safe operations board."
      >
        <OwnerScheduleWorkspace />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell user={user} activeHref="/appointments" title="Appointments and queue" subtitle="Unified schedule, walk-ins, and status visibility across the floor.">
      <section className="grid gap-4 lg:grid-cols-[1.12fr_0.88fr]">
        <Card className="rounded-[32px] p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="surface-label">Appointment details</p>
              <p className="mt-2 max-w-2xl text-sm text-white/58">Scan time, chair, balance, and current status without leaving the schedule view.</p>
            </div>
            <span className="status-pill text-[#d7ffab]">Live floor visibility</span>
          </div>

          <div className="mt-4 space-y-3 sm:hidden">
            {demoAppointments.map((appointment) => (
              <div key={appointment.id} className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[#baff69]">{appointment.status.replaceAll("_", " ")}</p>
                  <p className="text-sm text-white/50">{dateLabel(appointment.start)}</p>
                </div>
                <div className="mt-3 grid gap-3 grid-cols-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/38">Chair</p>
                    <p className="mt-1 text-sm text-white/75">{appointment.chair}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/38">Balance</p>
                    <p className="mt-1 text-sm text-white/75">${appointment.balanceDue}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 hidden overflow-x-auto rounded-3xl border border-white/10 bg-black/20 sm:block">
            <table className="min-w-[34rem] w-full text-left text-sm">
              <thead className="bg-white/5 text-white/45">
                <tr>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Chair</th>
                  <th className="px-4 py-3">Balance</th>
                </tr>
              </thead>
              <tbody>
                {demoAppointments.map((appointment) => (
                  <tr key={appointment.id} className="border-t border-white/10 text-white/75">
                    <td className="px-4 py-3">{appointment.status.replaceAll("_", " ")}</td>
                    <td className="px-4 py-3">{dateLabel(appointment.start)}</td>
                    <td className="px-4 py-3">{appointment.chair}</td>
                    <td className="px-4 py-3">${appointment.balanceDue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="rounded-[32px] p-5 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="surface-label">Walk-in management</p>
              <p className="mt-2 text-sm text-white/58">Claim requests, keep wait estimates visible, and protect queue clarity during rush windows.</p>
            </div>
            <span className="status-pill text-[#d7ffab]">Front desk ready</span>
          </div>
          <div className="mt-4 space-y-3">
            {demoWalkIns.map((walkIn) => (
              <div key={walkIn.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium">{walkIn.clientName}</p>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[#baff69]">{walkIn.status}</p>
                </div>
                <p className="mt-1 text-sm text-white/50">Requested {walkIn.requestedService}</p>
                <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-white/45">{walkIn.waitMinutes} minute wait estimate</p>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </DashboardShell>
  );
}
