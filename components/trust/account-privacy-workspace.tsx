"use client";

import { useMemo, useState } from "react";
import {
  Pr27EvidenceCard,
  Pr27PrimaryButton,
  Pr27SecondaryButton,
  Pr27TrustShell
} from "@/components/trust/pr27-trust-shell";

type PrivacyState =
  | "home"
  | "export"
  | "exportsent"
  | "deactivate"
  | "delete"
  | "confirm"
  | "graceperiod"
  | "restored"
  | "deleted";

type PrivacySnapshot = {
  demo: boolean;
  firstName: string;
  memberSince: string | null;
  visitCount: number | null;
  openBookingCount: number;
  lifecycle: {
    status: string;
    deletionGraceEndsAt: string | null;
    canRestore: boolean;
  };
  exports: Array<{ id: string; status: string; requested_at: string }>;
  blockedAccounts?: Array<{
    profileId: string;
    displayName: string;
    publicUsername: string | null;
    blockedAt: string;
  }>;
};

const RAIL = [
  { id: "home", label: "Privacy home" },
  { id: "export", label: "Export data" },
  { id: "exportsent", label: "Export sent" },
  { id: "deactivate", label: "Deactivate" },
  { id: "delete", label: "Delete · step 1" },
  { id: "confirm", label: "Delete · confirm" },
  { id: "graceperiod", label: "Grace window" },
  { id: "restored", label: "Restored" },
  { id: "deleted", label: "Deleted" }
] as const;

const COPY: Record<PrivacyState, {
  icon: string;
  tone: "green" | "gold" | "red" | "dim";
  eyebrow: string;
  headline: string;
  subline: string;
}> = {
  home: {
    icon: "3",
    tone: "green",
    eyebrow: "Your data, your call",
    headline: "Privacy & account",
    subline: "Export everything, pause your profile, or leave entirely — each path is one honest screen away."
  },
  export: {
    icon: "↓",
    tone: "green",
    eyebrow: "Export my data",
    headline: "Everything, portable",
    subline: "Bookings, receipts, messages, posts, and profile — packaged as a download within 24 hours, link by email."
  },
  exportsent: {
    icon: "✓",
    tone: "green",
    eyebrow: "Export requested",
    headline: "On its way",
    subline: "We’ll email the download link within 24 hours. It works for 24 hours, for you only."
  },
  deactivate: {
    icon: "~",
    tone: "gold",
    eyebrow: "Take a break",
    headline: "Pause, don’t erase",
    subline: "Profile hidden, notifications off, bookings follow their disclosed policy. Sign back in anytime and everything returns."
  },
  delete: {
    icon: "!",
    tone: "red",
    eyebrow: "Delete your account",
    headline: "What deletion means",
    subline: "Profile, posts, comments, favorites, messages: erased. Required payment, refund, rent, and consent evidence stays sealed and never becomes public."
  },
  confirm: {
    icon: "!",
    tone: "red",
    eyebrow: `Last check`,
    headline: "This is the real one",
    subline: "Type-to-confirm plus a code sent to your verified email. A 7-day cool-off follows — restore during it to cancel deletion."
  },
  graceperiod: {
    icon: "~",
    tone: "gold",
    eyebrow: "Deletion scheduled",
    headline: "7 days to change your mind",
    subline: "Your account is dark now. Restore during the grace window; after it closes, eligible personal and social data is permanently erased."
  },
  restored: {
    icon: "✓",
    tone: "green",
    eyebrow: "Welcome back",
    headline: "Everything’s where you left it",
    subline: "Deletion canceled. Profile, history, favorites — untouched. No questions asked."
  },
  deleted: {
    icon: "·",
    tone: "dim",
    eyebrow: "Account deleted",
    headline: "Gone, as promised",
    subline: "Eligible data is erased. Required financial and consent records remain sealed until their retention clock ends."
  }
};

async function postPrivacyAction(payload: Record<string, unknown>) {
  const response = await fetch("/api/account/privacy-controls", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Account privacy action failed.");
  return body;
}

function prettyDate(value: string | null) {
  if (!value) return "pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "pending";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function AccountPrivacyWorkspace({ initial }: { initial: PrivacySnapshot }) {
  const initialState: PrivacyState = initial.lifecycle.status === "deletion_grace"
    ? "graceperiod"
    : initial.lifecycle.status === "deleted"
      ? "deleted"
      : "home";
  const [state, setState] = useState<PrivacyState>(initialState);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [challengeSent, setChallengeSent] = useState(false);
  const [challengeDestination, setChallengeDestination] = useState("your verified email");
  const [demoChallenge, setDemoChallenge] = useState<string | null>(null);
  const [typedConfirmation, setTypedConfirmation] = useState("");
  const [submittedChallenge, setSubmittedChallenge] = useState("");
  const [graceEndsAt, setGraceEndsAt] = useState(initial.lifecycle.deletionGraceEndsAt);
  const [blockedAccounts, setBlockedAccounts] = useState(initial.blockedAccounts ?? []);
  const [unblockingProfileId, setUnblockingProfileId] = useState<string | null>(null);
  const copy = COPY[state];
  const memberFact = useMemo(() => {
    const member = initial.memberSince ? `Member since ${initial.memberSince}` : "Member account";
    return initial.visitCount === null ? member : `${member} · ${initial.visitCount} visits`;
  }, [initial.memberSince, initial.visitCount]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Account privacy action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function unblock(profileId: string) {
    setUnblockingProfileId(profileId);
    setMessage(null);
    try {
      const response = await fetch("/api/culture/safety-controls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "block", targetProfileId: profileId, active: false })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to unblock this account.");
      setBlockedAccounts((current) => current.filter((account) => account.profileId !== profileId));
      setMessage("Account unblocked. Public discovery and messaging access are restored.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to unblock this account.");
    } finally {
      setUnblockingProfileId(null);
    }
  }

  function actions() {
    if (state === "home") {
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <Pr27SecondaryButton onClick={() => setState("export")}>Export my data</Pr27SecondaryButton>
          <Pr27SecondaryButton onClick={() => setState("deactivate")}>Deactivate — take a break</Pr27SecondaryButton>
          <Pr27PrimaryButton tone="red" onClick={() => setState("delete")}>Delete my account</Pr27PrimaryButton>
        </div>
      );
    }
    if (state === "export") {
      return (
        <Pr27PrimaryButton
          disabled={busy}
          onClick={() => run(async () => {
            await postPrivacyAction({ action: "request_export" });
            setState("exportsent");
          })}
        >
          {busy ? "Requesting…" : "Request export →"}
        </Pr27PrimaryButton>
      );
    }
    if (state === "deactivate") {
      return (
        <div className="flex flex-wrap justify-center gap-3">
          <Pr27PrimaryButton
            disabled={busy}
            onClick={() => run(async () => {
              await postPrivacyAction({ action: "deactivate" });
              setMessage("Account deactivated. Sign in again to restore everything.");
            })}
          >
            {busy ? "Pausing…" : "Deactivate my account"}
          </Pr27PrimaryButton>
          <Pr27SecondaryButton onClick={() => setState("home")}>Keep my account</Pr27SecondaryButton>
        </div>
      );
    }
    if (state === "delete") {
      return (
        <div className="flex flex-wrap justify-center gap-3">
          <Pr27PrimaryButton tone="red" onClick={() => setState("confirm")}>
            I understand — continue
          </Pr27PrimaryButton>
          <Pr27SecondaryButton onClick={() => setState("home")}>Keep my account</Pr27SecondaryButton>
        </div>
      );
    }
    if (state === "confirm") {
      if (!challengeSent) {
        return (
          <Pr27PrimaryButton
            tone="red"
            disabled={busy}
            onClick={() => run(async () => {
              const body = await postPrivacyAction({ action: "request_deletion_challenge" });
              setChallengeSent(true);
              setChallengeDestination(body.maskedDestination ?? "your verified email");
              setDemoChallenge(body.demoChallenge ?? null);
              setMessage(`Verification code sent to ${body.maskedDestination ?? "your verified email"}. It expires in 10 minutes.`);
            })}
          >
            {busy ? "Sending…" : "Send verification code →"}
          </Pr27PrimaryButton>
        );
      }
      return (
        <form
          className="mx-auto grid max-w-xl gap-3 text-left"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const body = await postPrivacyAction({
                action: "schedule_deletion",
                typedConfirmation,
                submittedChallenge
              });
              setGraceEndsAt(body.deletionGraceEndsAt);
              setState("graceperiod");
            });
          }}
        >
          <label className="grid gap-2 text-xs text-white/60">
            Type DELETE MY BVRB3R ACCOUNT
            <input
              value={typedConfirmation}
              onChange={(event) => setTypedConfirmation(event.target.value)}
              className="min-h-12 rounded-[14px] border border-white/12 bg-black/40 px-4 text-sm text-white outline-none focus:border-[#FF9B9B]/60"
              autoComplete="off"
            />
          </label>
          <label className="grid gap-2 text-xs text-white/60">
            Verification code sent to <span className="font-mono text-[#C9A87C]">{challengeDestination}</span>
            <input
              value={submittedChallenge}
              onChange={(event) => setSubmittedChallenge(event.target.value)}
              className="min-h-12 rounded-[14px] border border-white/12 bg-black/40 px-4 font-mono text-sm uppercase text-white outline-none focus:border-[#FF9B9B]/60"
              autoComplete="off"
            />
            {demoChallenge ? <span className="font-mono text-[10px] text-white/35">Demo-only code: {demoChallenge}</span> : null}
          </label>
          <Pr27PrimaryButton tone="red" type="submit" disabled={busy}>
            {busy ? "Scheduling…" : "Schedule deletion"}
          </Pr27PrimaryButton>
        </form>
      );
    }
    if (state === "graceperiod") {
      return (
        <div className="flex flex-wrap justify-center gap-3">
          <Pr27SecondaryButton
            disabled={busy}
            onClick={() => run(async () => {
              await postPrivacyAction({ action: "restore" });
              setState("restored");
            })}
          >
            Restore my account
          </Pr27SecondaryButton>
        </div>
      );
    }
    return <Pr27SecondaryButton onClick={() => setState("home")}>Privacy home</Pr27SecondaryButton>;
  }

  return (
    <Pr27TrustShell
      pathLabel="Account · privacy & deletion"
      rail={[...RAIL]}
      activeState={state}
      onStateChange={(next) => setState(next as PrivacyState)}
      eyebrow={copy.eyebrow}
      headline={copy.headline}
      icon={copy.icon}
      tone={copy.tone}
    >
      <Pr27EvidenceCard>
        <p className="mx-auto max-w-2xl text-center text-sm leading-7 text-white/58">{copy.subline}</p>

        <div className="my-6 flex flex-wrap justify-center gap-2">
          {state === "home" ? (
            <Fact>{memberFact}</Fact>
          ) : null}
          {state === "export" ? <Fact>Format: readable + machine (JSON)</Fact> : null}
          {state === "exportsent" ? <Fact>Requested: just now ✓</Fact> : null}
          {state === "deactivate" ? <Fact>Reversible · nothing deleted</Fact> : null}
          {state === "delete" ? (
            <>
              <Fact>Erased: social & personal data</Fact>
              <Fact>Kept: sealed legal money records only</Fact>
            </>
          ) : null}
          {state === "confirm" ? <Fact>Cool-off: 7 days · cancel anytime</Fact> : null}
          {state === "graceperiod" ? (
            <>
              <Fact>Scheduled: {prettyDate(graceEndsAt)}</Fact>
              <Fact>Restore: sign in and confirm</Fact>
            </>
          ) : null}
          {state === "restored" ? <Fact>Restored ✓</Fact> : null}
          {state === "deleted" ? <Fact>Confirmation sent ✓</Fact> : null}
        </div>

        <div className="text-center">{actions()}</div>

        {state === "home" ? (
          <section className="mt-7 border-t border-white/10 pt-6 text-left" aria-labelledby="blocked-accounts-heading">
            <h3 id="blocked-accounts-heading" className="text-sm font-black uppercase tracking-[0.14em] text-white">Blocked accounts</h3>
            <p className="mt-2 text-xs leading-5 text-white/48">Blocking is symmetric across public discovery and messaging. Unblock here at any time.</p>
            {blockedAccounts.length ? (
              <ul className="mt-4 grid gap-2">
                {blockedAccounts.map((account) => (
                  <li key={account.profileId} className="flex items-center justify-between gap-3 rounded-[16px] border border-white/10 bg-white/[0.035] p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">{account.displayName}</p>
                      <p className="mt-1 truncate text-xs text-white/42">
                        {account.publicUsername ? `@${account.publicUsername.replace(/^@/, "")}` : "Private profile"} · blocked {prettyDate(account.blockedAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={unblockingProfileId === account.profileId}
                      onClick={() => void unblock(account.profileId)}
                      className="min-h-10 shrink-0 rounded-full border border-[#c4f24e]/28 px-4 text-xs font-black text-[#e4f9b8] disabled:opacity-50"
                    >
                      {unblockingProfileId === account.profileId ? "Unblocking…" : "Unblock"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-[16px] border border-white/8 bg-white/[0.025] p-3 text-sm text-white/42">No blocked accounts.</p>
            )}
          </section>
        ) : null}

        {state === "delete" && initial.openBookingCount > 0 ? (
          <p className="mt-5 rounded-[16px] border border-[#FF9B9B]/25 bg-[#FF9B9B]/7 p-3 text-center text-xs leading-5 text-[#FFB0B0]">
            Open bookings must be canceled or completed first — {initial.openBookingCount} upcoming {initial.openBookingCount === 1 ? "appointment" : "appointments"} found.
          </p>
        ) : null}
        {state === "exportsent" ? (
          <p className="mt-5 text-center text-xs leading-5 text-white/42">
            The authenticated link expires after 24 hours and is scoped to this account only.
          </p>
        ) : null}
        {state === "deleted" ? (
          <p className="mt-5 text-center text-xs leading-5 text-white/42">
            A brand-new account later starts truly fresh — nothing links back.
          </p>
        ) : null}
        {message ? (
          <p role="status" className="mt-5 text-center text-xs leading-5 text-[#C9A87C]">{message}</p>
        ) : null}
      </Pr27EvidenceCard>
    </Pr27TrustShell>
  );
}

function Fact({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-white/52">
      {children}
    </span>
  );
}
