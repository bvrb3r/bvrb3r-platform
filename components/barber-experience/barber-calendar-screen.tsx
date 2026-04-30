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
    </div>
  );
}
