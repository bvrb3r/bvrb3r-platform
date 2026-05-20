"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type {
  ArchitectSupportInboxPayload,
  ArchitectSupportThreadPayload,
  ArchitectSupportThreadSummary
} from "@/lib/messages/service";
import { cn } from "@/lib/utils";

type ApiError = {
  error?: string;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const body = (await response.json().catch(() => ({}))) as T | ApiError;

  if (!response.ok) {
    throw new Error((body as ApiError).error ?? `Request failed with status ${response.status}`);
  }

  return body as T;
}

function formatRelativeTime(value?: string | null) {
  if (!value) {
    return "No activity";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function initials(name?: string | null) {
  const parts = (name ?? "BVRB3R Support").trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "B") + (parts[1]?.[0] ?? "");
}

function ThreadRow({
  thread,
  selected,
  onSelect
}: {
  thread: ArchitectSupportThreadSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const displayName = thread.client?.fullName ?? thread.counterpart?.fullName ?? "Client";
  const preview = thread.lastMessage?.body ?? thread.reportContext.preview ?? "Support conversation opened.";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "grid w-full grid-cols-[2.75rem_1fr] gap-3 rounded-lg border p-3 text-left transition",
        selected ? "border-[#7CFF00]/35 bg-[#7CFF00]/8" : "border-white/10 bg-black/20 hover:border-white/18"
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[#7CFF00]/20 bg-[#7CFF00]/10 text-xs font-black uppercase text-[#d7ffab]">
        {initials(displayName)}
      </span>
      <span className="min-w-0">
        <span className="flex items-center justify-between gap-3">
          <span className="truncate text-sm font-semibold text-white">{displayName}</span>
          <span className="shrink-0 text-[11px] text-white/42">{formatRelativeTime(thread.updatedAt)}</span>
        </span>
        <span className="mt-1 block truncate text-xs text-white/58">{preview}</span>
        <span className="mt-2 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/52">
          {thread.reportContext.present ? "Report" : "Support"}
        </span>
      </span>
    </button>
  );
}

export function ArchitectMessagesWorkspace() {
  const [inbox, setInbox] = useState<ArchitectSupportInboxPayload | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadPayload, setThreadPayload] = useState<ArchitectSupportThreadPayload | null>(null);
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState<{ tone: "info" | "success" | "error"; message: string } | null>(null);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);

  const loadInbox = useCallback(async (preferredThreadId?: string | null) => {
    setLoadingInbox(true);
    try {
      const payload = await requestJson<ArchitectSupportInboxPayload>("/api/architect/messages");
      setInbox(payload);
      setSelectedThreadId((currentThreadId) => preferredThreadId ?? currentThreadId ?? payload.threads[0]?.id ?? null);
      setStatus(null);
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : "Architect messages could not load." });
    } finally {
      setLoadingInbox(false);
    }
  }, []);

  const loadThread = useCallback(async (threadId: string) => {
    setLoadingThread(true);
    try {
      const payload = await requestJson<ArchitectSupportThreadPayload>(`/api/architect/messages/${threadId}`);
      setThreadPayload(payload);
      setStatus(null);
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : "Support thread could not load." });
    } finally {
      setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    if (!selectedThreadId) {
      setThreadPayload(null);
      return;
    }

    void loadThread(selectedThreadId);
  }, [loadThread, selectedThreadId]);

  const selectedThread = useMemo(
    () => inbox?.threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [inbox?.threads, selectedThreadId]
  );

  async function handleReply() {
    if (!selectedThreadId || !reply.trim()) {
      return;
    }

    setSending(true);
    setStatus(null);
    try {
      await requestJson(`/api/architect/messages/${selectedThreadId}`, {
        method: "POST",
        body: JSON.stringify({ body: reply })
      });
      setReply("");
      await Promise.all([loadThread(selectedThreadId), loadInbox(selectedThreadId)]);
      setStatus({ tone: "success", message: "Reply sent to the client support thread." });
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : "Reply could not be sent." });
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="px-2 py-6 sm:px-3 lg:px-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-lg border border-white/10 bg-black/35 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-[#7CFF00]/20 bg-[#7CFF00]/8 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d7ffab]">
                <ShieldCheck className="h-4 w-4" />
                Architect Messages
              </p>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-white">Support inbox</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
                Report conversations, client support threads, and Architect replies in one operational lane.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={() => void loadInbox(selectedThreadId)} disabled={loadingInbox}>
              <RefreshCw className="h-4 w-4" />
              {loadingInbox ? "Refreshing" : "Refresh"}
            </Button>
          </div>
          {status ? (
            <div
              className={cn(
                "mt-4 rounded-lg border px-4 py-3 text-sm",
                status.tone === "success" && "border-[#7CFF00]/25 bg-[#7CFF00]/10 text-[#d7ffab]",
                status.tone === "info" && "border-white/10 bg-white/[0.04] text-white/70",
                status.tone === "error" && "border-rose-400/25 bg-rose-400/10 text-rose-100"
              )}
            >
              {status.message}
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 lg:grid-cols-[24rem_1fr]">
          <Card className="border-white/10 bg-black/28 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/42">Conversations</p>
                <p className="mt-1 text-sm text-white/62">{inbox?.threads.length ?? 0} support threads</p>
              </div>
              <MessageCircle className="h-5 w-5 text-[#d7ffab]" />
            </div>
            <div className="mt-4 space-y-2">
              {loadingInbox ? (
                <p className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-white/58">Loading support conversations...</p>
              ) : inbox?.threads.length ? (
                inbox.threads.map((thread) => (
                  <ThreadRow
                    key={thread.id}
                    thread={thread}
                    selected={thread.id === selectedThreadId}
                    onSelect={() => setSelectedThreadId(thread.id)}
                  />
                ))
              ) : (
                <p className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-white/58">No support conversations yet.</p>
              )}
            </div>
          </Card>

          <Card className="border-white/10 bg-black/28 p-4">
            {selectedThread ? (
              <div className="flex min-h-[36rem] flex-col">
                <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                  <div className="min-w-0">
                    <p className="truncate text-xl font-semibold text-white">{selectedThread.client?.fullName ?? selectedThread.counterpart?.fullName ?? "Client"}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/42">
                      {selectedThread.reportContext.present ? "Report conversation" : "Support conversation"}
                    </p>
                    {selectedThread.reportContext.preview ? (
                      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/58">{selectedThread.reportContext.preview}</p>
                    ) : null}
                  </div>
                  <span className="rounded-full border border-[#7CFF00]/20 bg-[#7CFF00]/10 px-3 py-1 text-xs font-semibold text-[#d7ffab]">
                    {selectedThread.status}
                  </span>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto py-4">
                  {loadingThread ? (
                    <p className="text-sm text-white/58">Loading conversation...</p>
                  ) : threadPayload?.messages.length ? (
                    threadPayload.messages.map((message) => (
                      <div key={message.id} className={cn("flex", message.isOwn ? "justify-end" : "justify-start")}>
                        <div className={cn("max-w-[82%] rounded-lg border px-4 py-3 text-sm leading-6", message.isOwn ? "border-[#7CFF00]/25 bg-[#7CFF00]/12 text-[#ecffd6]" : "border-white/10 bg-white/[0.045] text-white/78")}>
                          <p className="whitespace-pre-wrap">{message.body}</p>
                          <p className="mt-2 text-[11px] text-white/42">{formatRelativeTime(message.createdAt)}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-white/58">No messages in this support thread yet.</p>
                  )}
                </div>

                <div className="border-t border-white/10 pt-4">
                  <label htmlFor="architect-support-reply" className="sr-only">Reply to client</label>
                  <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                    <textarea
                      id="architect-support-reply"
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                      placeholder="Reply as BVRB3R Support..."
                      className="min-h-24 rounded-lg border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/32 focus:border-[#7CFF00]/35 focus:ring-2 focus:ring-[#7CFF00]/10"
                    />
                    <Button type="button" onClick={() => void handleReply()} disabled={sending || !reply.trim()}>
                      <Send className="h-4 w-4" />
                      {sending ? "Sending" : "Send"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[28rem] items-center justify-center rounded-lg border border-white/10 bg-white/[0.025] p-8 text-center">
                <div>
                  <MessageCircle className="mx-auto h-8 w-8 text-white/42" />
                  <p className="mt-4 text-lg font-semibold text-white">Select a support conversation</p>
                  <p className="mt-2 text-sm text-white/58">Report threads and client support messages open here.</p>
                </div>
              </div>
            )}
          </Card>
        </section>
      </div>
    </main>
  );
}
