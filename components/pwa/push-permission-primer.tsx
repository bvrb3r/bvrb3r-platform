import { BellRing, CalendarClock, CircleDollarSign, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PushPermissionState } from "@/types/mobile";

export type PushPrimerIntent = "booking" | "chair" | "owner" | "notifications";

const intentHeadings: Record<PushPrimerIntent, string> = {
  booking: "Keep every booking on time.",
  chair: "Know when the chair moves.",
  owner: "See shop-critical updates as they happen.",
  notifications: "Keep time-critical alerts close."
};

const valueRows = [
  {
    title: "Appointment reminders",
    description: "Know when a booking is confirmed, rescheduled, or coming up soon.",
    Icon: CalendarClock
  },
  {
    title: "Your barber says you’re up",
    description: "See queue and chair calls even while BVRB3R is closed.",
    Icon: UsersRound
  },
  {
    title: "Payout landed",
    description: "Catch payout, payment-failure, and important account updates.",
    Icon: CircleDollarSign
  }
] as const;

interface PushPermissionPrimerProps {
  intent: PushPrimerIntent;
  permission: PushPermissionState;
  activating: boolean;
  message: string | null;
  recoveryInstructions: string;
  onEnable: () => void;
  onNotNow: () => void;
}

export function PushPermissionPrimer({
  intent,
  permission,
  activating,
  message,
  recoveryInstructions,
  onEnable,
  onNotNow
}: PushPermissionPrimerProps) {
  const denied = permission === "denied";

  return (
    <div className="fixed inset-0 z-[70] grid place-items-end bg-black/70 p-3 backdrop-blur-sm sm:place-items-center sm:p-6">
      <section
        aria-describedby="push-permission-primer-description"
        aria-labelledby="push-permission-primer-title"
        aria-modal="true"
        className="w-full max-w-xl rounded-[30px] border border-white/10 bg-[rgba(7,7,7,0.98)] p-5 text-[#F5F1E8] shadow-[0_28px_80px_rgba(0,0,0,0.58)] sm:p-6"
        role="dialog"
      >
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#C4F24E]/25 bg-[#C4F24E]/10 text-[#C4F24E]">
            <BellRing className="h-5 w-5" />
          </span>
          <div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#C4F24E]">
              Alerts on this device
            </p>
            <h2 id="push-permission-primer-title" className="mt-2 font-serif text-3xl leading-tight sm:text-4xl">
              {intentHeadings[intent]}
            </h2>
            <p id="push-permission-primer-description" className="mt-3 text-sm leading-6 text-white/55">
              BVRB3R will ask your device for notification permission only after you choose Enable below.
            </p>
          </div>
        </div>

        <ul className="mt-6 grid gap-3">
          {valueRows.map(({ title, description, Icon }) => (
            <li key={title} className="flex gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-white/58">
                <Icon className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-white/88">{title}</span>
                <span className="mt-1 block text-xs leading-5 text-white/45">{description}</span>
              </span>
            </li>
          ))}
        </ul>

        {denied ? (
          <div className="mt-5 rounded-2xl border border-[#D9B461]/30 bg-[#D9B461]/[0.07] p-4" role="status">
            <p className="text-sm font-semibold text-[#F0D28D]">Permission is blocked in device settings</p>
            <p className="mt-2 text-xs leading-6 text-white/58">{recoveryInstructions}</p>
          </div>
        ) : null}

        {message && !denied ? <p className="mt-4 text-xs leading-5 text-white/52" role="status">{message}</p> : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {!denied ? (
            <Button className="h-11 min-w-32 px-5" disabled={activating} onClick={onEnable}>
              {activating ? "Connecting…" : "Enable"}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" className="h-11 min-w-32 px-5" onClick={onNotNow}>
            Not now
          </Button>
        </div>
      </section>
    </div>
  );
}
