import type { Route } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Card } from "@/components/ui/card";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function AppointmentsPage({
  searchParams
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const user = await getAuthorizedUser(["owner", "manager", "front_desk", "commission_barber", "booth_rent_barber"]);
  const isBarber = user.role === "commission_barber" || user.role === "booth_rent_barber";

  if (isBarber) {
    const params = await searchParams;
    const query = new URLSearchParams();
    if (params.view) {
      query.set("view", params.view);
    }
    if (params.date) {
      query.set("date", params.date);
    }
    redirect(`/dashboard/barber/calendar${query.size ? `?${query.toString()}` : ""}` as Route);
  }

  if (user.role === "owner") {
    const params = await searchParams;
    const query = new URLSearchParams();
    if (params.view) {
      query.set("view", params.view);
    }
    if (params.date) {
      query.set("date", params.date);
    }
    redirect(`/dashboard/owner/schedule${query.size ? `?${query.toString()}` : ""}` as Route);
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

          <div className="mt-4 rounded-[28px] border border-dashed border-white/10 bg-black/20 p-6 text-sm leading-6 text-white/58">
            No appointments are scheduled for this account yet. Real bookings will appear here after clients create or check in for appointments.
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
          <div className="mt-4 rounded-[28px] border border-dashed border-white/10 bg-black/20 p-6 text-sm leading-6 text-white/58">
            No walk-ins are waiting right now. Queue records will stay empty until real guests join the line.
          </div>
        </Card>
      </section>
    </DashboardShell>
  );
}
