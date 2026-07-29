"use client";

import { useState } from "react";
import { BellRing, CheckCircle2, Clock3, Mail, MessageSquareText, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import type { NotificationCenterPayload } from "@/lib/notifications/service";

type PreferenceState = {
  push_enabled: boolean;
  sms_enabled: boolean;
  email_enabled: boolean;
  message_alerts_enabled: boolean;
  rewards_alerts_enabled: boolean;
  creator_alerts_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
};

function statusTone(status: string) {
  if (["delivered", "corrected"].includes(status)) return "border-[#C4F24E]/25 text-[#e4f9b8]";
  if (["failed", "escalated"].includes(status)) return "border-red-300/25 text-red-100";
  if (["retrying", "scheduled"].includes(status)) return "border-amber-300/25 text-amber-100";
  return "border-white/10 text-white/50";
}

function channelIcon(channel: string) {
  if (channel === "sms") return <MessageSquareText className="h-4 w-4" />;
  if (channel === "email") return <Mail className="h-4 w-4" />;
  if (channel === "push") return <Smartphone className="h-4 w-4" />;
  return <BellRing className="h-4 w-4" />;
}

function PreferenceToggle({
  label,
  helper,
  checked,
  onChange
}: {
  label: string;
  helper: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-[22px] border border-white/8 bg-black/20 p-4">
      <span>
        <span className="block text-sm font-semibold text-white">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-white/45">{helper}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 shrink-0 accent-[#C4F24E]"
      />
    </label>
  );
}

export function NotificationCenterScreen({
  initial
}: {
  initial: NotificationCenterPayload;
}) {
  const [payload, setPayload] = useState(initial);
  const [activeView, setActiveView] = useState<"center" | "preferences" | "ledger">("center");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [preferences, setPreferences] = useState<PreferenceState>({
    push_enabled: initial.preferences?.pushEnabled ?? false,
    sms_enabled: initial.preferences?.smsEnabled ?? false,
    email_enabled: initial.preferences?.emailEnabled ?? true,
    message_alerts_enabled: initial.preferences?.messageAlertsEnabled ?? true,
    rewards_alerts_enabled: initial.preferences?.rewardsAlertsEnabled ?? true,
    creator_alerts_enabled: initial.preferences?.creatorAlertsEnabled ?? false,
    quiet_hours_start: initial.preferences?.quietHoursStart ?? "22:00",
    quiet_hours_end: initial.preferences?.quietHoursEnd ?? "08:00"
  });

  async function refresh(options: { clearFeedback?: boolean } = {}) {
    if (options.clearFeedback !== false) {
      setFeedback(null);
    }
    const response = await fetch("/api/notifications", { cache: "no-store" });
    const body = await response.json() as NotificationCenterPayload & { error?: string };
    if (!response.ok) {
      setFeedback({ tone: "error", message: body.error ?? "Unable to refresh notifications." });
      return false;
    }
    setPayload(body);
    return true;
  }

  async function savePreferences() {
    setSaving(true);
    setFeedback(null);
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preferences)
    });
    const body = await response.json() as { error?: string };
    setSaving(false);
    if (!response.ok) {
      setFeedback({ tone: "error", message: body.error ?? "Unable to save notification preferences." });
      return;
    }
    const refreshed = await refresh({ clearFeedback: false });
    if (refreshed) {
      setFeedback({ tone: "success", message: "Preferences and consent evidence saved. Operational booking, queue, and money truth remains on." });
    }
  }

  const unread = payload.items.filter((item) => !["read", "delivered"].includes(item.status)).length;

  return (
    <div className="space-y-4" data-testid="notification-center">
      <Card className="rounded-[34px] p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="surface-label text-[#D9B461]">Notifications</p>
            <h2 className="mt-3 text-4xl font-semibold sm:text-6xl" data-display="true">Everything that moved<span className="text-[#C4F24E]">.</span></h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/60">Per-channel consent, quiet hours, delivery attempts, failures, retries, and corrections stay visible in one accountable trail.</p>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4 text-right">
            <p className="text-3xl font-semibold" data-display="true">{unread}</p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-white/42">Needs attention</p>
            <Button className="mt-4 h-10 min-h-10" variant="secondary" onClick={() => void refresh()}>
              <RefreshCw className="h-4 w-4" />Refresh
            </Button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {([
            ["center", "Notification center"],
            ["preferences", "Preferences"],
            ["ledger", "Delivery ledger"]
          ] as const).map(([key, label]) => (
            <Button key={key} variant={activeView === key ? "primary" : "secondary"} onClick={() => setActiveView(key)}>
              {label}
            </Button>
          ))}
        </div>
        {feedback ? <div className="mt-5"><FeedbackBanner tone={feedback.tone} message={feedback.message} /></div> : null}
      </Card>

      {activeView === "center" ? (
        <Card className="rounded-[34px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Recent alerts</p>
            <BellRing className="h-5 w-5 text-[#C4F24E]" />
          </div>
          <div className="mt-5 space-y-3">
            {payload.items.length ? payload.items.map((item) => (
              <article key={item.id} className="rounded-[24px] border border-white/8 bg-black/20 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <span className="mt-0.5 rounded-full border border-white/10 p-2 text-[#C4F24E]">{channelIcon(item.channel)}</span>
                    <div>
                      <p className="font-semibold text-white">{item.title}</p>
                      <p className="mt-2 text-sm leading-7 text-white/58">{item.body}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {item.operational ? <span className="status-pill text-[#D9B461]">Operational</span> : null}
                    <span className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] ${statusTone(item.status)}`}>{item.status}</span>
                  </div>
                </div>
                <p className="mt-3 text-xs text-white/35">{item.createdAt ? new Date(item.createdAt).toLocaleString() : "Time pending"} · {item.channel.replaceAll("_", " ")}</p>
              </article>
            )) : (
              <div className="empty-state-panel rounded-[24px] p-6 text-sm leading-7 text-white/55">Nothing new. Booking, queue, receipt, and account truth will appear here when it exists.</div>
            )}
          </div>
          <p className="mt-5 text-xs leading-6 text-white/38">Operational booking, queue, cancellation, receipt, and money alerts cannot be muted. Marketing remains separate and optional.</p>
        </Card>
      ) : null}

      {activeView === "preferences" ? (
        <Card className="rounded-[34px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Notification preferences</p>
              <h3 className="mt-3 text-3xl font-semibold" data-display="true">Only what moves your appointment.</h3>
            </div>
            <ShieldCheck className="h-6 w-6 text-[#C4F24E]" />
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <PreferenceToggle label="Push reminders" helper="Appointment and queue reminders on registered devices." checked={preferences.push_enabled} onChange={(value) => setPreferences((current) => ({ ...current, push_enabled: value }))} />
            <PreferenceToggle label="SMS updates" helper="Texts only when a verified phone and consent exist." checked={preferences.sms_enabled} onChange={(value) => setPreferences((current) => ({ ...current, sms_enabled: value }))} />
            <PreferenceToggle label="Email updates" helper="Appointment and account updates by email." checked={preferences.email_enabled} onChange={(value) => setPreferences((current) => ({ ...current, email_enabled: value }))} />
            <PreferenceToggle label="Messages" helper="Client, barber, shop, and support messages." checked={preferences.message_alerts_enabled} onChange={(value) => setPreferences((current) => ({ ...current, message_alerts_enabled: value }))} />
            <PreferenceToggle label="Rebooking" helper="Optional rebook reminders; never an automatic booking." checked={preferences.rewards_alerts_enabled} onChange={(value) => setPreferences((current) => ({ ...current, rewards_alerts_enabled: value }))} />
            <PreferenceToggle label="Culture" helper="Optional creator and culture updates." checked={preferences.creator_alerts_enabled} onChange={(value) => setPreferences((current) => ({ ...current, creator_alerts_enabled: value }))} />
          </div>
          <div className="mt-5 rounded-[24px] border border-white/8 bg-black/20 p-5">
            <p className="surface-label">Quiet hours</p>
            <p className="mt-2 text-sm leading-6 text-white/52">Non-operational messages wait on the server. Active-visit chair-ready and cancellation truth still arrives.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div><label className="mb-2 block text-xs text-white/45">Start</label><Input type="time" value={preferences.quiet_hours_start} onChange={(event) => setPreferences((current) => ({ ...current, quiet_hours_start: event.target.value }))} /></div>
              <div><label className="mb-2 block text-xs text-white/45">End</label><Input type="time" value={preferences.quiet_hours_end} onChange={(event) => setPreferences((current) => ({ ...current, quiet_hours_end: event.target.value }))} /></div>
            </div>
          </div>
          <Button className="mt-5" disabled={saving} onClick={() => void savePreferences()}>{saving ? "Saving evidence…" : "Save preferences"}</Button>
        </Card>
      ) : null}

      {activeView === "ledger" ? (
        <Card className="rounded-[34px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Delivery states</p>
              <h3 className="mt-3 text-3xl font-semibold" data-display="true">Every message, accounted for.</h3>
            </div>
            <CheckCircle2 className="h-6 w-6 text-[#C4F24E]" />
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-[10px] uppercase tracking-[0.18em] text-white/35">
                <tr><th className="px-3 py-3">When</th><th className="px-3 py-3">Message</th><th className="px-3 py-3">Channel</th><th className="px-3 py-3">Attempts</th><th className="px-3 py-3">State</th></tr>
              </thead>
              <tbody>
                {payload.deliveries.map((delivery) => (
                  <tr key={delivery.id} className="border-t border-white/8">
                    <td className="px-3 py-4 text-white/45">{new Date(delivery.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-4"><span className="text-white">{delivery.kind.replaceAll("_", " ")}</span>{delivery.operational ? <span className="ml-2 text-[9px] uppercase tracking-[0.14em] text-[#D9B461]">operational</span> : null}</td>
                    <td className="px-3 py-4 text-white/55">{delivery.channel}</td>
                    <td className="px-3 py-4 text-white/55">{delivery.attemptCount}</td>
                    <td className="px-3 py-4"><span className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] ${statusTone(delivery.status)}`}>{delivery.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!payload.deliveries.length ? <div className="empty-state-panel mt-4 rounded-[24px] p-6 text-sm text-white/55">No channel-delivery attempts have been recorded yet.</div> : null}
          </div>
          <p className="mt-5 flex items-center gap-2 text-xs leading-6 text-white/38"><Clock3 className="h-4 w-4" />Opt-outs, quiet-hour deferrals, retry attempts, failures, escalations, and corrections remain evidence—not disappearing UI state.</p>
        </Card>
      ) : null}
    </div>
  );
}
