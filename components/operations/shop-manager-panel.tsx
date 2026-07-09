"use client";
import { useState } from "react";
import { Bot, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueueEntryActionMutation } from "@/lib/operations/queue-client";
import { useShopManagerQuery } from "@/lib/operations/shop-manager-client";
import { getReadableActionError } from "@/lib/utils/feedback";
import type { ShopManagerSuggestion } from "@/types/shop-manager";

function MetricSkeleton() {
  return (
    <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-8 w-14" />
      <Skeleton className="mt-3 h-4 w-24" />
    </div>
  );
}

function priorityTone(priority: ShopManagerSuggestion["priority"]) {
  switch (priority) {
    case "high":
      return "text-[#e4f9b8]";
    case "medium":
      return "text-white/76";
    default:
      return "text-white/56";
  }
}

export function ShopManagerPanel({
  compact = false
}: {
  compact?: boolean;
}) {
  const managerQuery = useShopManagerQuery();
  const queueActionMutation = useQueueEntryActionMutation();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const payload = managerQuery.data;

  async function handleSuggestionAction(suggestion: ShopManagerSuggestion) {
    if (!suggestion.action || suggestion.action.kind !== "assign_queue") {
      return;
    }

    setFeedback(null);
    try {
      await queueActionMutation.mutateAsync({
        entryId: suggestion.action.entryId,
        action: "assign",
        barberId: suggestion.action.barberId
      });
      setFeedback({
        tone: "success",
        message: "Walk-in assignment pushed onto the canonical queue board."
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: getReadableActionError(error as Error)
      });
    }
  }

  return (
    <Card className="rounded-[32px] p-6" data-testid="shop-manager-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="surface-label">AI shop manager</p>
          <p className="mt-2 text-sm text-white/58">
            Suggestions only. Every recommendation is grounded in canonical queue, booking, schedule, and money data.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.22em]">
          <span className="status-pill text-[#e4f9b8]">{payload?.mode ?? "assist"} mode</span>
          <span className="status-pill text-white/56">{payload?.autoModeAvailable ? "Auto ready" : "Auto locked"}</span>
        </div>
      </div>

      {feedback ? (
        <div className="mt-4">
          <FeedbackBanner tone={feedback.tone} message={feedback.message} />
        </div>
      ) : null}
      {managerQuery.error ? (
        <div className="mt-4">
          <FeedbackBanner tone="error" message={getReadableActionError(managerQuery.error)} />
        </div>
      ) : null}

      <div className={`mt-4 grid gap-3 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
        {managerQuery.isLoading && !payload ? (
          <>
            <MetricSkeleton />
            <MetricSkeleton />
            {!compact ? <MetricSkeleton /> : null}
          </>
        ) : (
          <>
            <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Queue pressure</p>
              <p className="mt-3 text-2xl font-semibold" data-display="true">{payload?.summary.queueEntries ?? 0}</p>
              <p className="mt-2 text-sm text-white/58">Live queue entries still waiting on the floor.</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Open chairs</p>
              <p className="mt-3 text-2xl font-semibold" data-display="true">{payload?.summary.openChairs ?? 0}</p>
              <p className="mt-2 text-sm text-white/58">Current barber capacity available to absorb demand.</p>
            </div>
            {!compact ? (
              <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Recovery lanes</p>
                <p className="mt-3 text-2xl font-semibold" data-display="true">{payload?.summary.recoveryOpportunities ?? 0}</p>
                <p className="mt-2 text-sm text-white/58">Open slots or retention windows worth acting on now.</p>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {managerQuery.isLoading && !payload ? (
          <>
            <MetricSkeleton />
            <MetricSkeleton />
          </>
        ) : payload?.suggestions.length ? (
          payload.suggestions.map((suggestion) => (
            <div key={suggestion.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-[#C4F24E]/16 hover:bg-black/30">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-full border border-white/8 bg-black/25 p-2 text-[#e4f9b8]">
                    {suggestion.priority === "high" ? <TriangleAlert className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>
                  <div>
                    <p className="font-medium text-white">{suggestion.title}</p>
                    <p className={`mt-1 text-[11px] uppercase tracking-[0.22em] ${priorityTone(suggestion.priority)}`}>
                      {suggestion.priority} priority
                    </p>
                  </div>
                </div>
                <span className="status-pill text-white/60">{suggestion.audience.replaceAll("_", " ")}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/62">{suggestion.detail}</p>
              {suggestion.action ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {suggestion.action.kind === "link" ? (
                    <a
                      href={suggestion.action.href}
                      className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#e0f6a0]/40 bg-[linear-gradient(135deg,#c4f24e_0%,#d4f97a_100%)] px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-black shadow-[0_14px_34px_rgba(196, 242, 78,0.24)] transition hover:-translate-y-0.5 sm:px-5 sm:text-[11px] sm:tracking-[0.22em]"
                    >
                      {suggestion.action.label}
                    </a>
                  ) : (
                    <Button disabled={queueActionMutation.isPending} onClick={() => void handleSuggestionAction(suggestion)}>
                      {queueActionMutation.isPending ? "Applying..." : suggestion.action.label}
                    </Button>
                  )}
                  {suggestion.safeAutomation ? (
                    <span className="inline-flex min-h-11 items-center rounded-full border border-white/8 bg-black/20 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60 sm:px-5 sm:text-[11px] sm:tracking-[0.22em]">
                      <Sparkles className="mr-2 h-4 w-4 text-[#d9f985]" />
                      Safe assist
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div className="empty-state-panel rounded-[24px] p-6 text-sm leading-7 text-white/58">
            No live shop suggestions are competing for attention right now.
          </div>
        )}
      </div>

      <div className="mt-4 rounded-[24px] border border-white/8 bg-black/18 p-4 text-sm text-white/62">
        <p className="text-[#e4f9b8]">Auto mode stays off by default.</p>
        <p className="mt-2 leading-6">{payload?.autoModeReason ?? "Only safe, staff-approved automation lanes are eligible for future auto mode."}</p>
      </div>
    </Card>
  );
}
