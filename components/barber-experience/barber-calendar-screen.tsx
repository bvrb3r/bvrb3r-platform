import { CultureHomeEntryCard } from "@/components/culture/culture-home-entry-card";
import { BarberScheduleWorkspace } from "@/components/operations/barber-schedule-workspace";
import type { BarberSubtype } from "@/types/domain";

export function BarberCalendarScreen({
  barberName
}: {
  barberName: string;
  barberTitle: string;
  barberSubtype?: BarberSubtype;
}) {
  return (
    <div className="space-y-4" data-testid="barber-calendar-screen">
      <BarberScheduleWorkspace barberName={barberName} surface="calendar" />
      <CultureHomeEntryCard
        href="/dashboard/barber/culture"
        subtitle="Post cuts, discover styles, follow barbers, and turn attention into bookings."
        testId="barber-home-culture-entry"
      />
    </div>
  );
}
