"use client";

import { useState } from "react";
import {
  Pr27EvidenceCard,
  Pr27PrimaryButton,
  Pr27SecondaryButton,
  Pr27TrustShell
} from "@/components/trust/pr27-trust-shell";

type SafetyState =
  | "report"
  | "reported"
  | "block"
  | "blocked"
  | "mute"
  | "appeal"
  | "appealdone"
  | "modqueue"
  | "modcase"
  | "strikes";

type CultureSafetySnapshot = {
  demo: boolean;
  blockedAccounts: unknown[];
  mutedAccounts: unknown[];
  reports: unknown[];
  appeals: unknown[];
  standing: {
    activeStrikeCount: number;
    enforcement: string;
    postingPausedUntil: string | null;
    bookingAndMoneyUnaffected: boolean;
  };
  moderationQueue?: Array<{
    id: string;
    severity: string;
    status: string;
    post_id: string | null;
    reported_profile_id: string;
    created_at: string;
  }>;
  appealQueue?: Array<{
    id: string;
    case_id: string;
    status: string;
    submitted_at: string;
  }>;
};

const RAIL = [
  { id: "report", label: "Report post" },
  { id: "reported", label: "Report received" },
  { id: "block", label: "Block account" },
  { id: "blocked", label: "Blocked" },
  { id: "mute", label: "Mute" },
  { id: "appeal", label: "Appeal" },
  { id: "appealdone", label: "Appeal result" },
  { id: "modqueue", label: "Mod queue" },
  { id: "modcase", label: "Mod case" },
  { id: "strikes", label: "Strikes" }
] as const;

const COPY: Record<SafetyState, {
  icon: string;
  tone: "green" | "gold" | "red" | "dim";
  eyebrow: string;
  headline: string;
  subline: string;
}> = {
  report: {
    icon: "!",
    tone: "green",
    eyebrow: "Report this post",
    headline: "Say what’s wrong",
    subline: "From any post’s ··· menu. Pick a reason — spam, harassment, stolen work, explicit content, dangerous services, something else."
  },
  reported: {
    icon: "✓",
    tone: "green",
    eyebrow: "Report received",
    headline: "We’re on it",
    subline: "The post is flagged for human review. If reports pile up while it is under review, it hides automatically."
  },
  block: {
    icon: "✕",
    tone: "red",
    eyebrow: "Block account",
    headline: "Gone from your world",
    subline: "They can’t see your posts, message you, comment on your work, book your chair, or appear in your feed. They are not told."
  },
  blocked: {
    icon: "✓",
    tone: "green",
    eyebrow: "Blocked",
    headline: "Done quietly",
    subline: "The account is out of your Culture, Messages, search, comments, and booking in both directions."
  },
  mute: {
    icon: "·",
    tone: "dim",
    eyebrow: "Mute account",
    headline: "Softer than a block",
    subline: "Their posts stop appearing to you; everything else stays normal. They’ll never know."
  },
  appeal: {
    icon: "~",
    tone: "gold",
    eyebrow: "Your post was removed",
    headline: "Disagree? Say so",
    subline: "One appeal per decision. A different reviewer looks with fresh eyes and records the reasoning."
  },
  appealdone: {
    icon: "✓",
    tone: "green",
    eyebrow: "Appeal result",
    headline: "A fresh decision",
    subline: "When an appeal is upheld, the post returns and its strike is wiped from the account."
  },
  modqueue: {
    icon: "·",
    tone: "gold",
    eyebrow: "Moderation queue",
    headline: "Platform-side triage",
    subline: "Reports are ranked by severity and velocity. Every case carries content, history, reasons, and one accountable decision."
  },
  modcase: {
    icon: "·",
    tone: "gold",
    eyebrow: "Moderation case",
    headline: "One post, full context",
    subline: "Keep, warn, remove, or escalate — with reasoning written to the audit record."
  },
  strikes: {
    icon: "!",
    tone: "gold",
    eyebrow: "Account strikes",
    headline: "Three, then the door",
    subline: "Strike 1: warning. Strike 2: 7-day posting pause. Strike 3: Culture ban. Strikes expire after 12 clean months."
  }
};

async function postSafetyAction(payload: Record<string, unknown>) {
  const response = await fetch("/api/culture/safety-controls", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Culture safety action failed.");
  return body;
}

export function CultureSafetyWorkspace({
  initial,
  initialTargetProfileId = "",
  initialPostId = "",
  initialTargetHandle = "@roughcuts",
  canModerate = false
}: {
  initial: CultureSafetySnapshot;
  initialTargetProfileId?: string;
  initialPostId?: string;
  initialTargetHandle?: string;
  canModerate?: boolean;
}) {
  const [state, setState] = useState<SafetyState>("report");
  const [targetProfileId, setTargetProfileId] = useState(initialTargetProfileId);
  const [postId, setPostId] = useState(initialPostId);
  const [caseId, setCaseId] = useState(initial.moderationQueue?.[0]?.id ?? "");
  const [appealId, setAppealId] = useState(initial.appealQueue?.[0]?.id ?? "");
  const [reasoning, setReasoning] = useState("");
  const [reference, setReference] = useState("CUL-4471");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const copy = COPY[state];

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Culture safety action failed.");
    } finally {
      setBusy(false);
    }
  }

  function requireTarget() {
    if (!targetProfileId.trim()) throw new Error("Choose the account attached to this post.");
    return targetProfileId.trim();
  }

  async function report(category: "spam" | "harassment" | "stolen_work") {
    const body = await postSafetyAction({
      action: "report",
      reportedProfileId: requireTarget(),
      postId: postId.trim() || null,
      category,
      details: `Reported from the Product PR27 Culture safety surface: ${category}.`
    });
    setReference(body.reference);
    setState("reported");
  }

  function targetControls() {
    return (
      <div className="mx-auto mb-5 grid max-w-xl gap-3 text-left">
        <label className="grid gap-2 text-xs text-white/52">
          Account ID for {initialTargetHandle}
          <input
            value={targetProfileId}
            onChange={(event) => setTargetProfileId(event.target.value)}
            placeholder="profile UUID"
            className="min-h-11 rounded-[13px] border border-white/12 bg-black/40 px-3 font-mono text-xs text-white outline-none focus:border-[#C4F24E]/50"
          />
        </label>
        {state === "report" ? (
          <label className="grid gap-2 text-xs text-white/52">
            Post ID · optional
            <input
              value={postId}
              onChange={(event) => setPostId(event.target.value)}
              placeholder="Culture post UUID"
              className="min-h-11 rounded-[13px] border border-white/12 bg-black/40 px-3 font-mono text-xs text-white outline-none focus:border-[#C4F24E]/50"
            />
          </label>
        ) : null}
      </div>
    );
  }

  function actions() {
    if (state === "report") {
      return (
        <>
          {targetControls()}
          <div className="flex flex-wrap justify-center gap-3">
            <Pr27PrimaryButton disabled={busy} onClick={() => void run(() => report("harassment"))}>Harassment →</Pr27PrimaryButton>
            <Pr27SecondaryButton disabled={busy} onClick={() => void run(() => report("stolen_work"))}>Stolen work →</Pr27SecondaryButton>
            <Pr27SecondaryButton disabled={busy} onClick={() => void run(() => report("spam"))}>Spam →</Pr27SecondaryButton>
          </div>
        </>
      );
    }
    if (state === "reported") {
      return (
        <div className="flex flex-wrap justify-center gap-3">
          <Pr27SecondaryButton onClick={() => setState("block")}>Also block this account</Pr27SecondaryButton>
          <Pr27PrimaryButton onClick={() => setState("report")}>Done</Pr27PrimaryButton>
        </div>
      );
    }
    if (state === "block") {
      return (
        <>
          {targetControls()}
          <div className="flex flex-wrap justify-center gap-3">
            <Pr27PrimaryButton
              tone="red"
              disabled={busy}
              onClick={() => void run(async () => {
                await postSafetyAction({
                  action: "block",
                  targetProfileId: requireTarget(),
                  active: true,
                  reason: "Blocked from Culture safety controls."
                });
                setBlocked(true);
                setState("blocked");
              })}
            >
              Block →
            </Pr27PrimaryButton>
            <Pr27SecondaryButton onClick={() => setState("mute")}>Just mute instead</Pr27SecondaryButton>
          </div>
        </>
      );
    }
    if (state === "blocked") {
      return (
        <Pr27SecondaryButton
          disabled={busy || !blocked}
          onClick={() => void run(async () => {
            await postSafetyAction({ action: "block", targetProfileId: requireTarget(), active: false });
            setBlocked(false);
            setState("block");
          })}
        >
          Unblock
        </Pr27SecondaryButton>
      );
    }
    if (state === "mute") {
      return (
        <>
          {targetControls()}
          <Pr27PrimaryButton
            disabled={busy}
            onClick={() => void run(async () => {
              await postSafetyAction({ action: "mute", targetProfileId: requireTarget(), active: !muted });
              setMuted(!muted);
              setMessage(!muted ? "Muted quietly. Only your feed changes." : "Mute removed.");
            })}
          >
            {muted ? "Unmute" : "Mute →"}
          </Pr27PrimaryButton>
        </>
      );
    }
    if (state === "appeal") {
      return (
        <form
          className="mx-auto grid max-w-xl gap-3 text-left"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await postSafetyAction({ action: "appeal", caseId, reason: reasoning });
              setState("appealdone");
            });
          }}
        >
          <TextField label="Moderation case ID" value={caseId} onChange={setCaseId} />
          <TextArea label="Why the decision should change" value={reasoning} onChange={setReasoning} />
          <Pr27PrimaryButton type="submit" disabled={busy}>Appeal this decision</Pr27PrimaryButton>
        </form>
      );
    }
    if (state === "modqueue") {
      if (!canModerate) return <p className="text-xs text-white/42">Architect authority is required for the moderation queue.</p>;
      return (
        <div className="grid gap-3 text-left">
          {(initial.moderationQueue ?? []).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setCaseId(item.id);
                setState("modcase");
              }}
              className="rounded-[16px] border border-white/10 bg-white/[0.03] p-4 text-left"
            >
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#C9A87C]">{item.severity} · {item.status}</span>
              <span className="mt-2 block text-sm text-white">Case {item.id}</span>
            </button>
          ))}
          {!(initial.moderationQueue?.length) ? <p className="text-center text-xs text-white/42">No open cases.</p> : null}
        </div>
      );
    }
    if (state === "modcase") {
      if (!canModerate) return <p className="text-xs text-white/42">Architect authority is required for case decisions.</p>;
      return (
        <form className="mx-auto grid max-w-xl gap-3 text-left" onSubmit={(event) => event.preventDefault()}>
          <TextField label="Case ID" value={caseId} onChange={setCaseId} />
          <TextArea label="Decision reasoning · required" value={reasoning} onChange={setReasoning} />
          <div className="flex flex-wrap gap-3">
            {(["remove", "keep", "warn", "escalate"] as const).map((decision) => (
              <Pr27SecondaryButton
                key={decision}
                disabled={busy || reasoning.trim().length < 12}
                onClick={() => void run(async () => {
                  await postSafetyAction({ action: "moderate", caseId, decision, reasoning });
                  setMessage(`Decision recorded: ${decision}.`);
                  setState("modqueue");
                })}
              >
                {decision}
              </Pr27SecondaryButton>
            ))}
          </div>
        </form>
      );
    }
    if (state === "appealdone" && canModerate && appealId) {
      return (
        <form className="mx-auto grid max-w-xl gap-3 text-left" onSubmit={(event) => event.preventDefault()}>
          <TextField label="Appeal ID" value={appealId} onChange={setAppealId} />
          <TextArea label="Fresh-review reasoning" value={reasoning} onChange={setReasoning} />
          <div className="flex gap-3">
            <Pr27PrimaryButton
              disabled={busy || reasoning.trim().length < 12}
              onClick={() => void run(async () => {
                await postSafetyAction({ action: "resolve_appeal", appealId, outcome: "upheld", reasoning });
                setMessage("Appeal upheld. Post restored and strike removed.");
              })}
            >
              Uphold appeal
            </Pr27PrimaryButton>
            <Pr27SecondaryButton
              disabled={busy || reasoning.trim().length < 12}
              onClick={() => void run(async () => {
                await postSafetyAction({ action: "resolve_appeal", appealId, outcome: "denied", reasoning });
                setMessage("Appeal denied with reasoning recorded.");
              })}
            >
              Deny appeal
            </Pr27SecondaryButton>
          </div>
        </form>
      );
    }
    return <Pr27SecondaryButton onClick={() => setState("report")}>Back to reporting</Pr27SecondaryButton>;
  }

  return (
    <Pr27TrustShell
      pathLabel="Culture · safety & moderation"
      rail={[...RAIL]}
      activeState={state}
      onStateChange={(next) => setState(next as SafetyState)}
      eyebrow={copy.eyebrow}
      headline={copy.headline}
      icon={copy.icon}
      tone={copy.tone}
    >
      <Pr27EvidenceCard>
        <p className="mx-auto max-w-2xl text-center text-sm leading-7 text-white/58">{copy.subline}</p>
        <div className="my-6 flex flex-wrap justify-center gap-2">
          {state === "report" ? <Fact>Anonymous to the poster</Fact> : null}
          {state === "report" ? <Fact>Reviewed by a human</Fact> : null}
          {state === "reported" ? <Fact>Ref {reference} · reply expected &lt; 24h</Fact> : null}
          {state === "blocked" ? <Fact>Mutual invisibility · reversible</Fact> : null}
          {state === "mute" ? <Fact>Reversible in one tap</Fact> : null}
          {state === "appeal" ? <Fact>One appeal per decision · &lt; 48h</Fact> : null}
          {state === "appealdone" ? <Fact>Upheld → post restored · strike removed</Fact> : null}
          {state === "modqueue" ? <Fact>{initial.moderationQueue?.length ?? 0} open cases</Fact> : null}
          {state === "modcase" ? <Fact>Decision + reasoning → audit log</Fact> : null}
          {state === "strikes" ? <Fact>{initial.standing.activeStrikeCount} active · Culture only</Fact> : null}
        </div>
        <div className="text-center">{actions()}</div>
        {state === "reported" ? (
          <p className="mt-5 text-center text-xs leading-5 text-white/42">
            You’ll get the outcome either way — silence isn’t an answer here.
          </p>
        ) : null}
        {state === "blocked" ? (
          <p className="mt-5 text-center text-xs leading-5 text-white/42">
            Booking is also cut both ways — a blocked account can’t book your chair.
          </p>
        ) : null}
        {state === "strikes" ? (
          <p className="mt-5 text-center text-xs leading-5 text-white/42">
            A barber’s livelihood never dies over a feed dispute — Culture enforcement does not touch booking or money.
          </p>
        ) : null}
        {message ? <p role="status" className="mt-5 text-center text-xs text-[#C9A87C]">{message}</p> : null}
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

function TextField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-xs text-white/52">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 rounded-[13px] border border-white/12 bg-black/40 px-3 font-mono text-xs text-white outline-none focus:border-[#C9A87C]/60"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-xs text-white/52">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="rounded-[13px] border border-white/12 bg-black/40 px-3 py-3 text-sm text-white outline-none focus:border-[#C9A87C]/60"
      />
    </label>
  );
}
