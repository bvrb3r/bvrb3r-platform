import Link from "next/link";
import {
  ArrowLeft,
  BellRing,
  Check,
  ChevronRight,
  LockKeyhole,
  Medal,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users
} from "lucide-react";
import { shareRoadBadgeToCultureAction, updateRoadLeaderboardPrivacyAction } from "@/app/road/actions";
import { RoadBadgeCase } from "@/components/road/road-badge-case";
import { RoadReferralCode } from "@/components/road/road-referral-code";
import { FeatureGate } from "@/components/ui/feature-gate";
import { ROAD_DEFINITIONS, ROAD_ROLES, type RoadRole } from "@/lib/road/catalog";
import type { RoadSetSnapshot, RoadSnapshot } from "@/lib/road/domain";
import { cn } from "@/lib/utils";

function homeRoute(role: RoadRole) {
  if (role === "client_user") return "/dashboard/client";
  if (role === "barber_user") return "/dashboard/barber";
  return "/dashboard/owner";
}

function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="bvr-section-label">{title}</h2>
      {detail ? <p className="font-mono text-[9px] text-[var(--text-faint)]">{detail}</p> : null}
    </div>
  );
}

function SummaryStrip({ snapshot }: { snapshot: RoadSnapshot }) {
  const current = snapshot.sets[snapshot.currentSet];
  const cards = [
    { label: "Current set", value: `${current.code} · ${current.name}`, accent: true },
    { label: "Achievements", value: `${snapshot.completedAchievements} / ${snapshot.totalAchievements}` },
    { label: "Progress to V3", value: `${snapshot.percent}%`, progress: true },
    { label: "The summit", value: snapshot.summit, gold: true }
  ];

  return (
    <section aria-label="Road summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <article
          key={card.label}
          className={cn(
            "bvr-glass-card min-h-28 p-4",
            card.gold ? "border-[color:var(--bvr-gold-border)] bg-[var(--bvr-gold-soft)]" : ""
          )}
        >
          <p className={cn("font-mono text-[9px] uppercase tracking-[0.22em]", card.gold ? "text-[var(--bvr-gold-bright)]" : "text-[var(--text-faint)]")}>{card.label}</p>
          {card.progress ? (
            <div className="mt-4 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/15">
                <div className="h-full rounded-full bg-gradient-to-r from-[#C4F24E] to-[#D9B461]" style={{ width: `${snapshot.percent}%` }} />
              </div>
              <span className="font-mono text-xs text-[var(--bvr-green-text)]">{card.value}</span>
            </div>
          ) : (
            <p className={cn(
              "mt-3 text-balance",
              card.accent ? "font-serif text-2xl text-[var(--bvr-green-text)]" : card.gold ? "text-sm font-bold leading-5 text-[var(--bvr-gold-bright)]" : "font-serif text-2xl"
            )}>{card.value}</p>
          )}
        </article>
      ))}
    </section>
  );
}

function SetCardContent({ set }: { set: RoadSetSnapshot }) {
  return (
    <article className={cn("bvr-glass-card overflow-hidden", set.active ? "bvr-glass-card-active" : "")}>
      <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-5 py-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--bvr-gold-bright)]">{set.code}</span>
        <h3 className="font-serif text-2xl">{set.name}</h3>
        <span className="text-xs text-[var(--text-muted)]">{set.subtitle}</span>
        <span className="ml-auto font-mono text-[10px] text-[var(--text-faint)]">{set.completedCount} / {set.totalCount}</span>
        <span className={cn(
          "rounded-full border px-3 py-1 font-mono text-[8.5px] uppercase tracking-[0.12em]",
          set.complete || set.active
            ? "border-[color:var(--bvr-green-border)] bg-[var(--bvr-green-soft)] text-[var(--bvr-green-text)]"
            : "border-white/10 bg-white/[0.03] text-[var(--text-faint)]"
        )}>
          {set.complete ? "Complete" : set.active ? "In progress" : "Locked"}
        </span>
      </header>
      <div className="grid gap-x-6 px-5 py-3 md:grid-cols-2">
        {set.achievements.map((achievement) => (
          <div key={achievement.key} className="flex items-start gap-3 py-3">
            <span className={cn(
              "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border",
              achievement.complete
                ? "border-[#C4F24E] bg-[#C4F24E] text-[#0A0A0C]"
                : "border-white/20 text-transparent"
            )}>
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-[var(--text-primary)]">{achievement.label}</span>
              <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">{achievement.detail}</span>
              {achievement.complete && achievement.sourceEventId ? (
                <span className="mt-1 block font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--text-faint)]">Event {achievement.sourceEventId.slice(0, 8)}</span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
      <footer className="flex items-center gap-2 border-t border-white/10 bg-white/[0.015] px-5 py-3 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--bvr-green-text)]">
        <ChevronRight className="h-3 w-3" />
        {set.unlocks}
      </footer>
    </article>
  );
}

function Trail({ sets }: { sets: RoadSetSnapshot[] }) {
  return (
    <section aria-label="The Road trail" className="relative space-y-4 pl-10">
      <div aria-hidden="true" className="absolute bottom-6 left-3 top-6 w-0.5 bg-gradient-to-b from-[#C4F24E] via-[#C4F24E]/40 to-white/10" />
      {sets.map((set) => (
        <div key={set.code} id={`road-set-${set.index}`} className="relative scroll-mt-24">
          <span className={cn(
            "absolute -left-10 top-5 z-10 grid h-7 w-7 place-items-center rounded-full border font-mono text-[10px] font-bold",
            set.complete
              ? "border-[#C4F24E] bg-[#C4F24E] text-[#0A0A0C]"
              : set.active
                ? "border-[#C4F24E] bg-[#C4F24E]/12 text-[#C4F24E]"
                : "border-white/20 bg-[var(--bg-main)] text-[var(--text-faint)]"
          )}>{set.complete ? <Check className="h-4 w-4" /> : set.index}</span>
          {set.locked ? (
            <FeatureGate
              reason="staged"
              reasonCopy={`Complete SET ${set.index - 1} to open`}
              scale="card"
              label={`${set.code} · ${set.name}`}
              note={`The achievements remain visible, but SET ${set.index} cannot advance until SET ${set.index - 1} has a server-earned badge.`}
              className="rounded-[22px]"
            >
              <SetCardContent set={set} />
            </FeatureGate>
          ) : <SetCardContent set={set} />}
        </div>
      ))}
    </section>
  );
}

function BadgeShare({ snapshot }: { snapshot: RoadSnapshot }) {
  const latestSet = snapshot.sets.find((set) => set.badge?.id === snapshot.latestBadge?.id) ?? null;
  if (!snapshot.latestBadge || !latestSet) {
    return (
      <div className="bvr-glass-card p-6 text-sm leading-6 text-[var(--text-muted)]">
        Your first 4:5 Culture card will mint only after a complete set earns an immutable badge.
      </div>
    );
  }

  const caption = `${latestSet.badgeName} — earned. ${latestSet.badgeReward}. The road to V3 keeps moving.`;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(260px,340px)_1fr]">
      <div className="relative aspect-[4/5] overflow-hidden rounded-[28px] border border-[color:var(--bvr-green-border)] bg-[#08090A] p-7 text-center text-[#F5F1E8]">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(196,242,78,0.16),transparent_55%)]" />
        <div className="relative flex h-full flex-col items-center justify-center">
          <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-[#C4F24E]">Badge earned · {latestSet.code}</p>
          <span className="mt-6 grid h-24 w-24 place-items-center rounded-full border-2 border-[#C4F24E] bg-[#C4F24E]/10 shadow-[0_0_40px_rgba(196,242,78,0.28)]">
            <Medal className="h-10 w-10 text-[#C4F24E]" />
          </span>
          <p className="mt-5 font-serif text-3xl">{latestSet.badgeName}</p>
          <p className="mt-3 text-xs leading-5 text-white/50">{latestSet.badgeReward}</p>
          <p className="mt-auto font-mono text-[9px] uppercase tracking-[0.22em] text-white/45">BVRB3R · {snapshot.title}</p>
        </div>
      </div>
      <div className="bvr-glass-card p-5 sm:p-6">
        <h3 className="text-xl font-bold">Your Culture-ready card</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Optional and never auto-posted. Each badge can be shared once; the generated card can always be saved.</p>
        <form action={shareRoadBadgeToCultureAction} className="mt-5 space-y-4">
          <input type="hidden" name="badgeId" value={snapshot.latestBadge.id} />
          <label className="block text-xs font-semibold text-[var(--text-secondary)]" htmlFor="road-badge-caption">Caption</label>
          <textarea
            id="road-badge-caption"
            name="caption"
            defaultValue={caption}
            maxLength={2200}
            rows={5}
            disabled={Boolean(snapshot.latestBadge.sharedAt)}
            className="rounded-2xl border border-white/10 bg-black/15 p-4 text-sm leading-6 text-[var(--text-primary)] outline-none focus:border-[#C4F24E]/60 disabled:opacity-55"
          />
          <div className="flex flex-wrap gap-3">
            {snapshot.latestBadge.sharedAt ? (
              <span className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[color:var(--bvr-green-border)] bg-[var(--bvr-green-soft)] px-5 text-xs font-bold text-[var(--bvr-green-text)]">
                <Check className="h-4 w-4" /> Shared once to Culture
              </span>
            ) : (
              <button type="submit" className="bvr-primary-action min-h-12 px-6 text-xs">Share to Culture</button>
            )}
            <a
              href={`/api/road/badges/${snapshot.latestBadge.id}/share-card`}
              download={`bvrb3r-${latestSet.badgeName.toLowerCase().replaceAll(" ", "-")}.svg`}
              className="bvr-secondary-action inline-flex min-h-12 items-center px-6 text-xs font-bold"
            >
              Save image
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}

function Referrals({ snapshot }: { snapshot: RoadSnapshot }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
      <div className="bvr-glass-card p-5 sm:p-6">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-faint)]">Your role code</p>
        <div className="mt-4"><RoadReferralCode code={snapshot.referral.code} /></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ["01", "Share the code"],
            ["02", "They create their own account"],
            ["03", "They finish SET 1 — then it counts"]
          ].map(([step, label]) => (
            <div key={step} className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
              <span className="font-mono text-[9px] text-[var(--bvr-green-text)]">{step}</span>
              <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{label}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 font-mono text-[9px] leading-5 text-[var(--text-faint)]">{snapshot.referral.trigger}</p>
      </div>
      <div className="bvr-glass-card p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-faint)]">Reward ladder</p>
          <span className="rounded-full border border-[color:var(--bvr-green-border)] bg-[var(--bvr-green-soft)] px-3 py-1 font-mono text-[9px] text-[var(--bvr-green-text)]">{snapshot.referral.counted} counted</span>
        </div>
        <div className="mt-4 space-y-3">
          {snapshot.referral.ladder.map((milestone) => {
            const earned = snapshot.referral.counted >= milestone.count;
            return (
              <div key={milestone.count} className="flex items-center gap-3 rounded-2xl border border-white/10 p-3">
                <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full border font-mono text-xs", earned ? "border-[#C4F24E] bg-[#C4F24E] text-[#0A0A0C]" : "border-white/20 text-[var(--text-faint)]")}>{milestone.count}</span>
                <span className="text-xs leading-5 text-[var(--text-secondary)]">{milestone.reward}</span>
                <span className="ml-auto font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--text-faint)]">{earned ? "Earned" : `At ${milestone.count}`}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs leading-5 text-[var(--text-faint)]">Every reward is platform-funded. Nothing is deducted from barber earnings, tips, or rent.</p>
      </div>
    </div>
  );
}

function Leaderboard({ snapshot }: { snapshot: RoadSnapshot }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
      <div className="bvr-glass-card overflow-hidden">
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-sm font-semibold">Friends only · follow-back required</p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-faint)]">Road progress, badges, and streaks only. Never appointments, money, or location.</p>
        </div>
        {snapshot.leaderboard.optedIn ? (
          snapshot.leaderboard.rows.length > 0 ? (
            <ol className="divide-y divide-white/10">
              {snapshot.leaderboard.rows.map((row, index) => (
                <li key={row.userId} className={cn("flex items-center gap-3 px-5 py-4", row.isViewer ? "bg-[var(--bvr-green-soft)]" : "")}>
                  <span className={cn("grid h-7 w-7 place-items-center rounded-full border font-mono text-[10px]", index < 3 ? "border-[color:var(--bvr-gold-border)] text-[var(--bvr-gold-bright)]" : "border-white/15 text-[var(--text-faint)]")}>{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{row.username ? `@${row.username}` : row.displayName}{row.isViewer ? " · YOU" : ""}</span>
                    <span className="mt-1 block font-mono text-[8.5px] text-[var(--text-faint)]">SET {row.currentSet} · {row.earnedBadges} badges</span>
                  </span>
                  <div className="w-24 sm:w-40">
                    <div className="h-1.5 overflow-hidden rounded-full bg-black/15"><div className="h-full bg-gradient-to-r from-[#C4F24E] to-[#D9B461]" style={{ width: `${row.percent}%` }} /></div>
                    <span className="mt-1 block text-right font-mono text-[9px] text-[var(--text-muted)]">{row.percent}%</span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="p-8 text-center text-sm leading-6 text-[var(--text-muted)]">No mutual friends have opted into this role’s Road board yet.</div>
          )
        ) : (
          <div className="p-8 text-center">
            <Users className="mx-auto h-8 w-8 text-[var(--text-faint)]" />
            <p className="mt-3 text-sm font-semibold">Leaderboard is private by default</p>
            <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-[var(--text-muted)]">Opt in to appear only among people you follow who follow you back.</p>
          </div>
        )}
      </div>
      <form action={updateRoadLeaderboardPrivacyAction} className="bvr-glass-card p-5">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-faint)]">Privacy controls</p>
        <label className="mt-5 flex cursor-pointer items-start gap-3">
          <input type="checkbox" name="leaderboardVisible" defaultChecked={snapshot.leaderboard.optedIn} className="mt-1 h-4 w-4 accent-[#C4F24E]" />
          <span><span className="block text-sm font-semibold">Show me to mutual friends</span><span className="mt-1 block text-xs leading-5 text-[var(--text-faint)]">Turning this off hides you both ways.</span></span>
        </label>
        <label className="mt-5 flex cursor-pointer items-start gap-3">
          <input type="checkbox" name="leaderboardPushes" defaultChecked={snapshot.leaderboard.pushesEnabled} className="mt-1 h-4 w-4 accent-[#C4F24E]" />
          <span><span className="block text-sm font-semibold">Weekly leaderboard pushes</span><span className="mt-1 block text-xs leading-5 text-[var(--text-faint)]">Off by default; daily cap and quiet hours still apply.</span></span>
        </label>
        <button type="submit" className="bvr-primary-action mt-6 min-h-11 w-full px-5 text-xs">Save privacy</button>
      </form>
    </div>
  );
}

function StreakShields({ snapshot }: { snapshot: RoadSnapshot }) {
  if (!snapshot.streak) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="bvr-glass-card p-5 sm:p-6">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-faint)]">Your shield case</p>
        <div className="mt-5 flex gap-4">
          {[0, 1, 2].map((slot) => {
            const filled = slot < snapshot.streak!.availableShields;
            return (
              <span key={slot} className={cn("grid h-16 w-16 place-items-center rounded-full border-2", filled ? "border-[#C4F24E] bg-[#C4F24E]/10 text-[#C4F24E] shadow-[0_0_22px_rgba(196,242,78,0.2)]" : "border-dashed border-white/15 text-[var(--text-faint)]")}>
                <ShieldCheck className="h-7 w-7" />
              </span>
            );
          })}
        </div>
        <div className="mt-5 space-y-2 text-xs leading-5 text-[var(--text-secondary)]">
          <p><span className="font-mono text-[var(--bvr-green-text)]">+1</span> Complete SET 2 · The Regular</p>
          <p><span className="font-mono text-[var(--bvr-green-text)]">+1</span> Every referral that finishes SET 1</p>
          <p><span className="font-mono text-[var(--bvr-green-text)]">+1</span> Every 5-cut streak milestone</p>
        </div>
      </div>
      <div className="bvr-glass-card p-5 sm:p-6">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-faint)]">Auto-spend timeline</p>
        {snapshot.streak.windows.length > 0 ? (
          <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
            {snapshot.streak.windows.toReversed().map((window, index) => (
              <div key={window.windowStart} className="min-w-24 flex-1 text-center">
                <span className={cn("mx-auto grid h-10 w-10 place-items-center rounded-full border", window.status === "protected" ? "border-[#D9B461] bg-[#D9B461]/10 text-[#D9B461]" : window.status === "completed" ? "border-[#C4F24E] bg-[#C4F24E]/10 text-[#C4F24E]" : "border-white/20 text-[var(--text-faint)]")}>
                  {window.status === "protected" ? <ShieldCheck className="h-5 w-5" /> : <Check className="h-5 w-5" />}
                </span>
                <span className="mt-2 block font-mono text-[8px] text-[var(--text-faint)]">W{index + 1}</span>
                <span className="mt-1 block text-[10px] leading-4 text-[var(--text-muted)]">{window.status === "protected" ? "Missed — shield spent" : window.status === "completed" ? "Cut done" : "Missed"}</span>
              </div>
            ))}
          </div>
        ) : <p className="mt-5 text-sm leading-6 text-[var(--text-muted)]">The first verified rhythm window will appear here. No synthetic streak history is shown.</p>}
        <p className="mt-5 border-t border-white/10 pt-4 font-mono text-[9px] leading-5 text-[var(--text-faint)]">One shield per missed window · spends automatically · never expires · cannot be bought · maximum three available.</p>
      </div>
    </div>
  );
}

function PushPreviews({ snapshot }: { snapshot: RoadSnapshot }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {snapshot.pushes.map((push) => (
        <article key={push.key} className="bvr-glass-card min-h-48 p-4">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--bvr-green-soft)] text-[var(--bvr-green-text)]"><BellRing className="h-4 w-4" /></span>
            <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--text-faint)]">The Road</span>
          </div>
          <h3 className="mt-4 text-sm font-bold">{push.title}</h3>
          <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{push.body}</p>
          <p className="mt-4 border-t border-white/10 pt-3 font-mono text-[8px] leading-4 text-[var(--text-faint)]">{push.rule}</p>
        </article>
      ))}
    </div>
  );
}

function HomeWidgetSpec({ snapshot }: { snapshot: RoadSnapshot }) {
  const current = snapshot.sets[snapshot.currentSet];
  const next = current.achievements.find((achievement) => !achievement.complete) ?? current.achievements[0];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <p className="mb-2 font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Card — below the hero</p>
        <Link href="/road" className="bvr-glass-card block max-w-sm p-5 hover:border-[color:var(--bvr-green-border)]">
          <div className="flex items-center gap-3"><span className="bvr-section-label">The Road</span><span className="ml-auto rounded-full border border-[color:var(--bvr-green-border)] bg-[var(--bvr-green-soft)] px-3 py-1 font-mono text-[8px] text-[var(--bvr-green-text)]">{current.code}</span></div>
          <div className="mt-4 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/15"><div className="h-full bg-gradient-to-r from-[#C4F24E] to-[#D9B461]" style={{ width: `${snapshot.percent}%` }} /></div><span className="font-mono text-[10px] text-[var(--bvr-green-text)]">{snapshot.percent}%</span></div>
          <div className="mt-4 flex items-center gap-2 text-xs text-[var(--text-secondary)]"><span className="h-4 w-4 rounded-full border border-white/20" />Next: {next?.label ?? "Summit complete"}<ChevronRight className="ml-auto h-4 w-4" /></div>
        </Link>
      </div>
      <div>
        <p className="mb-2 font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Pill — tight spots</p>
        <Link href="/road" className="bvr-glass-card inline-flex min-h-12 items-center gap-3 rounded-full px-5"><span className="h-2 w-2 rounded-full bg-[#C4F24E] shadow-[0_0_8px_rgba(196,242,78,0.7)]" /><span className="font-mono text-[10px] uppercase tracking-[0.1em]">The Road · {current.code} · {snapshot.percent}%</span><ChevronRight className="h-3 w-3 text-[var(--text-faint)]" /></Link>
        <p className="mt-5 border-t border-white/10 pt-4 font-mono text-[9px] leading-5 text-[var(--text-faint)]">Below the hero · collapses when an appointment card needs space · hides for 24 hours after set completion · never above live money or queue truth.</p>
      </div>
    </div>
  );
}

export function RoadScreen({ snapshot }: { snapshot: RoadSnapshot }) {
  return (
    <main className="bvr-screen pb-20">
      <div className="mx-auto w-full max-w-[1120px] px-4 py-5 sm:px-7">
        <header className="flex flex-wrap items-center gap-3">
          <Link href={homeRoute(snapshot.role)} className="grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-white/[0.04]" aria-label="Back to your home"><ArrowLeft className="h-5 w-5" /></Link>
          <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-[color:var(--bvr-green-border)] bg-[var(--bvr-green-soft)] px-3 font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--bvr-green-text)]"><Check className="h-3 w-3" /> Auto-saves</span>
          <span className="font-bold tracking-[0.28em]">BVRB<span className="text-[#C4F24E]">3</span>R</span>
          <span className="rounded-full border border-[color:var(--bvr-gold-border)] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--bvr-gold-bright)]">Road maps — sign-up to V3</span>
          <div className="ml-auto flex rounded-full border border-white/15 p-1" aria-label="Road role">
            {ROAD_ROLES.map((role) => (
              <span key={role} aria-current={role === snapshot.role ? "page" : undefined} aria-disabled={role !== snapshot.role} className={cn("rounded-full px-4 py-2 font-mono text-[9px] uppercase tracking-[0.12em]", role === snapshot.role ? "bg-[#C4F24E] text-[#0A0A0C]" : "text-[var(--text-faint)]")}>{ROAD_DEFINITIONS[role].label}</span>
            ))}
          </div>
        </header>

        <section className="pb-5 pt-10">
          <p className="bvr-section-label">Your role · server-owned progress</p>
          <h1 className="mt-3 font-serif text-4xl sm:text-5xl">{snapshot.title}</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">{snapshot.subtitle} Each set must be completed before the next opens — the same closed-door honesty used everywhere else in BVRB3R.</p>
          {snapshot.serverTruth === "unavailable" ? (
            <div role="status" className="mt-5 rounded-2xl border border-[color:var(--bvr-gold-border)] bg-[var(--bvr-gold-soft)] p-4 text-sm leading-6 text-[var(--text-secondary)]">
              Road server truth is not connected in this local demo. The screen stays honestly empty; it does not invent progress, badges, referrals, friends, or streaks.
            </div>
          ) : null}
        </section>

        <SummaryStrip snapshot={snapshot} />

        <div className="mt-9"><SectionHeading title="The trail" detail="Five sets · locked sets stay visible and frosted" /><Trail sets={snapshot.sets} /></div>
        <div className="mt-10"><SectionHeading title="Badge case — achievements & rewards" detail="Click an earned badge to celebrate" /><RoadBadgeCase badges={snapshot.sets.map((set) => ({ index: set.index, code: set.code, badgeName: set.badgeName, badgeReward: set.badgeReward, complete: set.complete, badge: set.badge }))} /></div>
        <div className="mt-10"><SectionHeading title="Share the badge — straight to Culture" detail="4:5 card · optional · one share per badge" /><BadgeShare snapshot={snapshot} /></div>
        <div id="road-referrals" className="mt-10 scroll-mt-24"><SectionHeading title="Referrals" detail="Counts only when the referred account completes SET 1" /><Referrals snapshot={snapshot} /></div>
        <div className="mt-10"><SectionHeading title="Leaderboard — among your people" detail="Friends-only · off by default" /><Leaderboard snapshot={snapshot} /></div>
        {snapshot.streak ? <div className="mt-10"><SectionHeading title="Streak shields — how forgiveness works" detail="Client Road only" /><StreakShields snapshot={snapshot} /></div> : null}
        <div className="mt-10"><SectionHeading title="Milestone pushes — the nudge layer" detail="Max 2/day · quiet hours 9PM–9AM · server policy" /><PushPreviews snapshot={snapshot} /></div>
        <div className="mt-10"><SectionHeading title="Home-tab widget — the road, pocket size" detail="Ready for shell wiring without placeholder percentages" /><HomeWidgetSpec snapshot={snapshot} /></div>

        <footer className="mt-12 grid gap-3 rounded-[24px] border border-white/10 bg-white/[0.02] p-5 text-xs leading-6 text-[var(--text-muted)] sm:grid-cols-3">
          <p><LockKeyhole className="mr-2 inline h-4 w-4 text-[var(--bvr-green-text)]" />Locked achievements never accept client claims.</p>
          <p><Trophy className="mr-2 inline h-4 w-4 text-[var(--bvr-gold-bright)]" />Earned badges are immutable evidence.</p>
          <p><Sparkles className="mr-2 inline h-4 w-4 text-[var(--bvr-green-text)]" />Rewards are platform-funded, never barber money.</p>
        </footer>
      </div>
    </main>
  );
}
