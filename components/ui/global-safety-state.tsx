import {
  AlertTriangle,
  CloudOff,
  History,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Siren,
  UserRoundCheck
} from "lucide-react";
import { cn } from "@/lib/utils";

export const GLOBAL_SAFETY_STATE_KEYS = [
  "loading",
  "empty",
  "failed",
  "offline",
  "reconnecting",
  "conflict",
  "permission_changed",
  "provider_unavailable",
  "payment_degraded",
  "notification_degraded",
  "recovery",
  "support",
  "incident"
] as const;

export type GlobalSafetyStateKey = (typeof GLOBAL_SAFETY_STATE_KEYS)[number];

const copy: Record<GlobalSafetyStateKey, {
  headline: string;
  reason: string;
  safety: string;
  action: string;
  Icon: typeof ShieldCheck;
  tone: "neutral" | "green" | "amber" | "red" | "blue";
}> = {
  loading: {
    headline: "One second.",
    reason: "The latest server truth is loading.",
    safety: "No action has been submitted.",
    action: "Wait for the current truth",
    Icon: LoaderCircle,
    tone: "neutral"
  },
  empty: {
    headline: "Nothing here yet.",
    reason: "There is no record in this scope.",
    safety: "Nothing is missing or owed.",
    action: "Return to the previous view",
    Icon: History,
    tone: "neutral"
  },
  failed: {
    headline: "Unknown system failure.",
    reason: "The request did not reach a verified result.",
    safety: "Money and saved records stayed unchanged.",
    action: "Retry the request",
    Icon: AlertTriangle,
    tone: "red"
  },
  offline: {
    headline: "Showing the last truth.",
    reason: "This device is offline.",
    safety: "The last verified record is preserved.",
    action: "Reconnect to refresh",
    Icon: CloudOff,
    tone: "amber"
  },
  reconnecting: {
    headline: "Catching up…",
    reason: "The connection is back and events are reconciling.",
    safety: "New actions stay closed until the refresh finishes.",
    action: "Wait for reconciliation",
    Icon: RefreshCw,
    tone: "blue"
  },
  conflict: {
    headline: "Someone changed this first.",
    reason: "A newer server version won.",
    safety: "The newer record is intact and no duplicate was created.",
    action: "Review the newer version",
    Icon: History,
    tone: "amber"
  },
  permission_changed: {
    headline: "This door is closed.",
    reason: "Your authority changed while this view was open.",
    safety: "Private records remain protected.",
    action: "Return to your home",
    Icon: LockKeyhole,
    tone: "neutral"
  },
  provider_unavailable: {
    headline: "The provider is unavailable.",
    reason: "An external service is not responding.",
    safety: "BVRB3R records and external money remain separate.",
    action: "Check provider status",
    Icon: CloudOff,
    tone: "amber"
  },
  payment_degraded: {
    headline: "The processor is slow.",
    reason: "Settlement has not been confirmed.",
    safety: "The payment remains pending and was not counted twice.",
    action: "Review payment status",
    Icon: ShieldCheck,
    tone: "amber"
  },
  notification_degraded: {
    headline: "Delivery is delayed.",
    reason: "One or more notifications need another attempt.",
    safety: "The booking or money result itself is unchanged.",
    action: "Review delivery status",
    Icon: AlertTriangle,
    tone: "amber"
  },
  recovery: {
    headline: "Nothing was lost.",
    reason: "The previous action stopped safely.",
    safety: "Your verified record is ready to continue.",
    action: "Continue the recovery",
    Icon: ShieldCheck,
    tone: "green"
  },
  support: {
    headline: "A person is on this.",
    reason: "Support has the evidence needed for review.",
    safety: "The original record remains visible and unchanged.",
    action: "Track the support case",
    Icon: UserRoundCheck,
    tone: "blue"
  },
  incident: {
    headline: "Architect review is active.",
    reason: "A production invariant needs human ownership.",
    safety: "The affected mutation path is closed.",
    action: "Monitor the incident",
    Icon: Siren,
    tone: "red"
  }
};

const tones = {
  neutral: "border-white/12 bg-white/[0.035] text-white",
  green: "border-[#9BE15D]/35 bg-[#9BE15D]/8 text-[#E4F9B8]",
  amber: "border-[#D9B461]/35 bg-[#D9B461]/8 text-[#F8E5B5]",
  red: "border-[#F0563C]/35 bg-[#F0563C]/8 text-[#FFD0C8]",
  blue: "border-[#7FB5FF]/35 bg-[#7FB5FF]/8 text-[#D7E8FF]"
};

export function GlobalSafetyState({
  state,
  incidentReference,
  detail,
  actionLabel,
  onAction,
  className
}: {
  state: GlobalSafetyStateKey;
  incidentReference?: string | null;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  const stateCopy = copy[state];
  const Icon = stateCopy.Icon;
  const degraded = !["loading", "empty", "recovery"].includes(state);
  const reference = incidentReference
    ?? (degraded ? `BVR-${state.replaceAll("_", "-").toUpperCase()}` : null);

  return (
    <section
      className={cn(
        "rounded-[28px] border p-6",
        tones[stateCopy.tone],
        className
      )}
      data-safety-state={state}
    >
      <div className="flex items-start gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-current/20 bg-black/25">
          <Icon className={cn("h-5 w-5", state === "loading" && "animate-spin")} />
        </div>
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.035em]" data-display="true">
            {stateCopy.headline}
          </h2>
          <p className="mt-3 text-sm leading-6 text-white/68">{detail ?? stateCopy.reason}</p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
            {stateCopy.safety}
          </p>
          {reference ? (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
              Incident {reference}
            </p>
          ) : null}
          {onAction ? (
            <button
              type="button"
              onClick={onAction}
              className="mt-5 min-h-11 rounded-full border border-current/25 bg-black/25 px-5 text-sm font-bold"
            >
              {actionLabel ?? stateCopy.action}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
