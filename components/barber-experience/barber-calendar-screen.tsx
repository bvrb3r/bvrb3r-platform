import { BarberScheduleWorkspace } from "@/components/operations/barber-schedule-workspace";
import { BarberWorkspace } from "@/components/operations/barber-workspace";
import type { BarberSubtype } from "@/types/domain";

export function BarberCalendarScreen({
  barberName,
  barberTitle,
  barberSubtype
}: {
  barberName: string;
  barberTitle: string;
  barberSubtype?: BarberSubtype;
}) {
  return (
    <div className="space-y-4" data-testid="barber-calendar-screen">
      <BarberScheduleWorkspace barberName={barberName} />
      <BarberWorkspace barberName={barberName} barberTitle={barberTitle} barberSubtype={barberSubtype} />
    </div>
  );
}
