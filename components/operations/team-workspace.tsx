import { Building2, Clock3, ShieldCheck, Star, WalletCards } from "lucide-react";
import { Card } from "@/components/ui/card";
import { demoAppointments, demoBarbers, demoLocations, demoTasks } from "@/lib/data/demo";
import { currency, dateLabel } from "@/lib/utils";
import type { Role } from "@/types/domain";

function getWorkspaceCopy(role: Extract<Role, "owner" | "manager" | "front_desk">) {
  switch (role) {
    case "owner":
      return "See performance, approvals, and talent mix across the entire business without dropping into a spreadsheet-shaped experience.";
    case "manager":
      return "Track attendance, chair load, and team pressure for the current shop while ownership controls stay outside this lane.";
    case "front_desk":
      return "Keep the right barber visible for every arrival so the desk can assign quickly and communicate cleanly.";
    default:
      return "Team visibility stays role-aware here.";
  }
}

function getBarberTypeLabel(role: string) {
  return role === "booth_rent_barber" ? "Booth rent" : "Commission";
}

export function TeamWorkspace({ viewerRole, locationIds }: { viewerRole: Extract<Role, "owner" | "manager" | "front_desk">; locationIds: string[]; }) {
  const visibleBarbers = demoBarbers.filter((barber) => locationIds.length === 0 || barber.locationIds.some((locationId) => locationIds.includes(locationId)));
  const visibleAppointments = demoAppointments.filter((appointment) => locationIds.length === 0 || locationIds.includes(appointment.locationId));
  const completedToday = visibleAppointments.filter((appointment) => appointment.status === "completed").length;
  const bookedToday = visibleAppointments.filter((appointment) => appointment.status === "booked").length;
  const checkedInToday = visibleAppointments.filter((appointment) => appointment.status === "checked_in" || appointment.status === "in_service").length;
  const totalTodayRevenue = visibleBarbers.reduce((sum, barber) => sum + barber.todayEarnings, 0);
  const activeLocations = demoLocations.filter((location) => locationIds.includes(location.id));
  const urgentTasks = demoTasks.filter((task) => locationIds.includes(task.locationId) && task.status !== "done");
  const averageRating = visibleBarbers.length ? (visibleBarbers.reduce((sum, barber) => sum + barber.rating, 0) / visibleBarbers.length).toFixed(1) : "0.0";

  return (
    <div className="space-y-4" data-testid="team-workspace">
      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="surface-label">Team command layer</p>
              <h3 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">Barbers, coverage, and performance in one lane</h3>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">{getWorkspaceCopy(viewerRole)}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-4 text-sm text-white/68">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#7CFF00]/20 bg-[#7CFF00]/10 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">
                <Building2 className="h-4 w-4" />
                {activeLocations.map((location) => location.name).join(" | ") || "All assigned locations"}
              </div>
              <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-white/42">{visibleBarbers.length} visible barber profiles</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Active barbers</p>
              <p className="mt-3 text-3xl font-semibold" data-display="true">{visibleBarbers.length}</p>
              <p className="mt-2 text-sm text-white/58">Commission and booth-rent talent in the current scope.</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Revenue pulse</p>
              <p className="mt-3 text-3xl font-semibold" data-display="true">{currency(totalTodayRevenue)}</p>
              <p className="mt-2 text-sm text-white/58">Visible chair revenue posted today.</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Average rating</p>
              <p className="mt-3 flex items-center gap-2 text-3xl font-semibold" data-display="true"><Star className="h-5 w-5 fill-current text-[#d7ffab]" />{averageRating}</p>
              <p className="mt-2 text-sm text-white/58">Marketplace trust across the visible barber roster.</p>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <Card className="rounded-[32px] p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="surface-label">Schedule load</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{bookedToday}</p>
                <p className="mt-2 text-sm leading-6 text-white/60">Booked tickets still to be worked by the team today.</p>
              </div>
              <Clock3 className="h-5 w-5 text-[#baff69]" />
            </div>
          </Card>
          <Card className="rounded-[32px] p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="surface-label">Live service load</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{checkedInToday}</p>
                <p className="mt-2 text-sm leading-6 text-white/60">Guests already checked in or currently in service.</p>
              </div>
              <ShieldCheck className="h-5 w-5 text-[#baff69]" />
            </div>
          </Card>
          <Card className="rounded-[32px] p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="surface-label">Completed services</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{completedToday}</p>
                <p className="mt-2 text-sm leading-6 text-white/60">Work already closed out across the visible team today.</p>
              </div>
              <WalletCards className="h-5 w-5 text-[#baff69]" />
            </div>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Team roster</p>
              <p className="mt-2 text-sm text-white/58">A clean, mobile-safe view of who is on the floor, how they perform, and what model they work under.</p>
            </div>
            <span className="status-pill text-[#d7ffab]">Role-aware roster</span>
          </div>
          <div className="mt-4 space-y-3">
            {visibleBarbers.map((barber) => {
              const nextAppointment = visibleAppointments
                .filter((appointment) => appointment.barberId === barber.id && ["booked", "checked_in", "in_service"].includes(appointment.status))
                .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime())[0];

              return (
                <div key={barber.id} className="rounded-[26px] border border-white/8 bg-black/20 p-4 transition hover:border-[#7CFF00]/16 hover:bg-black/30">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">{barber.name}</p>
                      <p className="mt-1 text-sm text-white/52">{getBarberTypeLabel(barber.role)} | {barber.specialties.slice(0, 2).join(" | ")}</p>
                    </div>
                    <span className="status-pill text-[#d7ffab]">{barber.rating.toFixed(1)} rating</span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[20px] border border-white/8 bg-black/25 p-3">
                      <p className="surface-label">Today</p>
                      <p className="mt-2 text-xl font-semibold">{currency(barber.todayEarnings)}</p>
                    </div>
                    <div className="rounded-[20px] border border-white/8 bg-black/25 p-3">
                      <p className="surface-label">Next slot</p>
                      <p className="mt-2 text-sm text-white/72">{nextAppointment ? dateLabel(nextAppointment.start) : "Open now"}</p>
                    </div>
                    <div className="rounded-[20px] border border-white/8 bg-black/25 p-3">
                      <p className="surface-label">Availability</p>
                      <p className="mt-2 text-sm text-white/72">{barber.availabilityLabel}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Approvals and follow-up</p>
            <ShieldCheck className="h-5 w-5 text-[#baff69]" />
          </div>
          <div className="mt-4 space-y-3">
            {urgentTasks.length ? urgentTasks.map((task) => (
              <div key={task.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="font-medium text-white">{task.title}</p>
                <p className="mt-2 text-sm text-white/58">Assigned to {task.assignee}</p>
                <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-[#baff69]">{task.priority} priority</p>
              </div>
            )) : (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-black/15 p-5 text-sm leading-7 text-white/58">
                No urgent team approvals are waiting right now.
              </div>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
