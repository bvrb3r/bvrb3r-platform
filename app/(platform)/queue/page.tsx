import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { QueueWorkspace } from "@/components/operations/queue-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function QueuePage() {
  const user = await getAuthorizedUser(["owner", "manager", "front_desk"]);

  return (
    <DashboardShell
      user={user}
      activeHref="/queue"
      title={user.role === "owner" ? "Queue, waitlist, and arrival pressure" : user.role === "manager" ? "Queue control and assignment board" : "Check-in queue and waitlist control"}
      subtitle={user.role === "owner"
        ? "Track walk-in demand, waitlist conversion, and assignment pressure without leaving the owner command system."
        : user.role === "manager"
          ? "Run the live queue, protect wait times, and keep assignments flowing across the schedule."
          : "Everything the front desk needs for walk-ins, check-ins, barber assignment, and guest communication in one place."}
    >
      <QueueWorkspace viewerRole={user.role as "owner" | "manager" | "front_desk"} locationIds={user.locationIds} />
    </DashboardShell>
  );
}

