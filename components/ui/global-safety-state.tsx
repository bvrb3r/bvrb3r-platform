import { cn } from "@/lib/utils";

export const GLOBAL_SAFETY_STATE_KEYS = [
  "loading",
  "empty",
  "no_search_results",
  "empty_schedule",
  "empty_culture",
  "failed",
  "server_error",
  "offline",
  "reconnecting",
  "conflict",
  "permission_changed",
  "provider_unavailable",
  "payment_degraded",
  "payment_declined",
  "notification_degraded",
  "queue_closed",
  "kiosk_disconnected",
  "recovery",
  "support",
  "incident"
] as const;

export type GlobalSafetyStateKey = (typeof GLOBAL_SAFETY_STATE_KEYS)[number];

const copy: Record<GlobalSafetyStateKey, {
  glyph: string;
  headline: string;
  reason: string;
  truth: string;
  action: string;
  tone: "neutral" | "green" | "amber" | "red" | "blue";
}> = {
  loading: {
    glyph: "↻",
    headline: "One second.",
    reason: "The latest server truth is loading.",
    truth: "No action has been submitted.",
    action: "Wait for the current truth",
    tone: "neutral"
  },
  empty: {
    glyph: "0",
    headline: "Nothing here yet.",
    reason: "There is no record in this scope.",
    truth: "Nothing is missing or owed.",
    action: "Return to the previous view",
    tone: "neutral"
  },
  no_search_results: {
    glyph: "?",
    headline: "No match yet.",
    reason: "Nothing matches this search in the current scope.",
    truth: "Your filters and saved records are unchanged.",
    action: "Clear search",
    tone: "neutral"
  },
  empty_schedule: {
    glyph: "00",
    headline: "Your day is open.",
    reason: "No appointments or open slots are scheduled in this view.",
    truth: "No booking was removed.",
    action: "Open availability",
    tone: "green"
  },
  empty_culture: {
    glyph: "+",
    headline: "The culture starts here.",
    reason: "Follow a few barbers and fresh work will appear here.",
    truth: "Your account is ready; the feed is simply quiet.",
    action: "Discover barbers",
    tone: "green"
  },
  failed: {
    glyph: "!",
    headline: "Unknown system failure.",
    reason: "The request did not reach a verified result.",
    truth: "Money and saved records stayed unchanged.",
    action: "Retry the request",
    tone: "red"
  },
  server_error: {
    glyph: "500",
    headline: "We hit a wall.",
    reason: "The server could not return a verified result.",
    truth: "No unconfirmed write is presented as complete.",
    action: "Try again",
    tone: "red"
  },
  offline: {
    glyph: "—",
    headline: "You’re offline.",
    reason: "This device cannot reach the live service.",
    truth: "The last verified record is preserved.",
    action: "Try again",
    tone: "amber"
  },
  reconnecting: {
    glyph: "↻",
    headline: "Catching up…",
    reason: "The connection is back and events are reconciling.",
    truth: "New actions stay closed until the refresh finishes.",
    action: "Wait for reconciliation",
    tone: "blue"
  },
  conflict: {
    glyph: "≠",
    headline: "Someone changed this first.",
    reason: "A newer server version won.",
    truth: "The newer record is intact and no duplicate was created.",
    action: "Review the newer version",
    tone: "amber"
  },
  permission_changed: {
    glyph: "×",
    headline: "This door is closed.",
    reason: "Your authority changed while this view was open.",
    truth: "Private records remain protected.",
    action: "Return to your home",
    tone: "neutral"
  },
  provider_unavailable: {
    glyph: "↯",
    headline: "The provider is unavailable.",
    reason: "An external service is not responding.",
    truth: "BVRB3R records and external money remain separate.",
    action: "Check provider status",
    tone: "amber"
  },
  payment_degraded: {
    glyph: "$",
    headline: "The processor is slow.",
    reason: "Settlement has not been confirmed.",
    truth: "The payment remains pending and was not counted twice.",
    action: "Review payment status",
    tone: "amber"
  },
  payment_declined: {
    glyph: "$",
    headline: "Card declined.",
    reason: "The processor refused this card.",
    truth: "No money moved and your held slot remains visible.",
    action: "Try again",
    tone: "red"
  },
  notification_degraded: {
    glyph: "N",
    headline: "Delivery is delayed.",
    reason: "One or more notifications need another attempt.",
    truth: "The booking or money result itself is unchanged.",
    action: "Review delivery status",
    tone: "amber"
  },
  queue_closed: {
    glyph: "Q",
    headline: "The line is closed.",
    reason: "This shop is not accepting walk-ins right now.",
    truth: "No queue position or payment was created.",
    action: "View booking times",
    tone: "amber"
  },
  kiosk_disconnected: {
    glyph: "K",
    headline: "Kiosk disconnected.",
    reason: "The shop device is not reporting a verified connection.",
    truth: "No check-in, queue position, or payment was lost.",
    action: "Try another way",
    tone: "amber"
  },
  recovery: {
    glyph: "✓",
    headline: "Nothing was lost.",
    reason: "The previous action stopped safely.",
    truth: "Your verified record is ready to continue.",
    action: "Continue the recovery",
    tone: "green"
  },
  support: {
    glyph: "S",
    headline: "A person is on this.",
    reason: "Support has the evidence needed for review.",
    truth: "The original record remains visible and unchanged.",
    action: "Track the support case",
    tone: "blue"
  },
  incident: {
    glyph: "!",
    headline: "Architect review is active.",
    reason: "A production invariant needs human ownership.",
    truth: "The affected mutation path is closed.",
    action: "Monitor the incident",
    tone: "red"
  }
};

const tones = {
  neutral: "border-white/12 text-white",
  green: "border-[#9BE15D]/35 text-[#E4F9B8]",
  amber: "border-[#D9B461]/35 text-[#F8E5B5]",
  red: "border-[#F0563C]/35 text-[#FFD0C8]",
  blue: "border-[#7FB5FF]/35 text-[#D7E8FF]"
};

const nonIncidentStates: GlobalSafetyStateKey[] = [
  "loading",
  "empty",
  "no_search_results",
  "empty_schedule",
  "empty_culture",
  "recovery"
];

export function GlobalSafetyState({
  state,
  incidentReference,
  headline,
  detail,
  actionLabel,
  actionHref,
  onAction,
  className
}: {
  state: GlobalSafetyStateKey;
  incidentReference?: string | null;
  headline?: string;
  detail?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}) {
  const stateCopy = copy[state];
  const degraded = !nonIncidentStates.includes(state);
  const reference = incidentReference
    ?? (degraded ? `BVR-${state.replaceAll("_", "-").toUpperCase()}` : null);
  const actionClassName = "mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full border border-[#C4F24E] bg-[#C4F24E] px-5 text-center text-sm font-extrabold text-[#060708] transition hover:bg-[#E4F9B8] sm:w-auto";

  return (
    <section
      className={cn(
        "rounded-[22px] border bg-[#0A0A0C] p-6",
        tones[stateCopy.tone],
        className
      )}
      data-safety-state={state}
    >
      <span className="grid h-14 w-14 place-items-center rounded-full border border-current/25 font-mono text-[11px] font-bold uppercase tracking-[0.08em]">
        {stateCopy.glyph}
      </span>
      <h2 className="mt-5 font-serif text-[32px] font-normal leading-[1.05] tracking-[-0.02em] text-[#F5F1E8]">
        {headline ?? stateCopy.headline}
      </h2>
      <p className="mt-3 max-w-xl text-[13.5px] leading-6 text-white/60">
        {detail ?? stateCopy.reason}
      </p>
      <p className="mt-4 font-mono text-[9px] uppercase leading-5 tracking-[0.12em] text-white/38">
        {stateCopy.truth}
      </p>
      {reference ? (
        <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-white/30">
          Incident {reference}
        </p>
      ) : null}
      {actionHref ? (
        <a href={actionHref} className={actionClassName}>
          {actionLabel ?? stateCopy.action} →
        </a>
      ) : onAction ? (
        <button type="button" onClick={onAction} className={actionClassName}>
          {actionLabel ?? stateCopy.action} →
        </button>
      ) : null}
    </section>
  );
}
