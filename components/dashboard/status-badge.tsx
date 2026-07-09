import type { Appointment, AppointmentStatus } from "@/types/domain";
import { cn } from "@/lib/utils";

type AppointmentVisualStatus = AppointmentStatus | "ready_for_checkout";

const statusMeta: Record<AppointmentVisualStatus, { label: string; className: string }> = {
  pending: {
    label: "Pending",
    className: "border-white/10 bg-white/[0.04] text-white/62"
  },
  confirmed: {
    label: "Confirmed",
    className: "border-white/10 bg-black/25 text-white/72"
  },
  booked: {
    label: "Booked",
    className: "border-white/10 bg-black/25 text-white/72"
  },
  checked_in: {
    label: "Checked in",
    className: "border-amber-300/18 bg-amber-300/10 text-amber-200"
  },
  in_service: {
    label: "In service",
    className: "border-sky-300/18 bg-sky-300/10 text-sky-200"
  },
  ready_for_checkout: {
    label: "Ready for checkout",
    className: "border-[#C4F24E]/18 bg-[#C4F24E]/10 text-[#e4f9b8]"
  },
  completed: {
    label: "Completed",
    className: "border-[#C4F24E]/16 bg-[#C4F24E]/8 text-[#e4f9b8]"
  },
  cancelled: {
    label: "Cancelled",
    className: "border-white/10 bg-white/[0.04] text-white/55"
  },
  no_show: {
    label: "No-show",
    className: "border-rose-300/18 bg-rose-300/10 text-rose-200"
  },
  refunded: {
    label: "Refunded",
    className: "border-slate-300/18 bg-slate-300/10 text-slate-100"
  }
};

function resolveStatus(status: AppointmentStatus, balanceDue = 0): AppointmentVisualStatus {
  if (status === "completed" && balanceDue > 0) {
    return "ready_for_checkout";
  }

  return status;
}

export function getAppointmentStatusLabel(status: AppointmentStatus, balanceDue = 0) {
  return statusMeta[resolveStatus(status, balanceDue)].label;
}

export function StatusBadge({ appointment, status, balanceDue, className }: { appointment?: Appointment; status?: AppointmentStatus; balanceDue?: number; className?: string }) {
  const resolvedStatus = appointment
    ? resolveStatus(appointment.status, appointment.balanceDue)
    : resolveStatus(status ?? "booked", balanceDue ?? 0);
  const meta = statusMeta[resolvedStatus];

  return (
    <span className={cn("status-pill transition", meta.className, className)}>
      <span className="h-2 w-2 rounded-full bg-current/70" />
      {meta.label}
    </span>
  );
}
