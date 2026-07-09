"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { MessageCircle } from "lucide-react";
import { useCreateMessageThreadMutation } from "@/lib/messages/client";
import { useState } from "react";

export function PublicBarberMessageAction({
  barberProfileId,
  canMessage,
  username
}: {
  barberProfileId: string;
  canMessage: boolean;
  username: string;
}) {
  const router = useRouter();
  const createThread = useCreateMessageThreadMutation();
  const [error, setError] = useState<string | null>(null);

  async function handleMessage() {
    setError(null);

    if (!canMessage) {
      router.push(`/login?next=/barber/${encodeURIComponent(username)}` as Route);
      return;
    }

    try {
      const payload = await createThread.mutateAsync({
        threadType: "client_barber",
        profileId: barberProfileId
      });
      router.push((payload.thread?.id ? `/dashboard/client/messages/${payload.thread.id}` : "/dashboard/client/messages") as Route);
    } catch {
      setError("Message could not be opened. Try again from Messages.");
    }
  }

  return (
    <span className="inline-flex flex-col gap-2">
      <button
        type="button"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.045] px-4 py-2 text-sm font-bold text-white transition hover:border-[#c4f24e]/35 hover:bg-white/[0.075] hover:text-[#e4f9b8] disabled:opacity-60"
        disabled={createThread.isPending}
        onClick={() => void handleMessage()}
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        {createThread.isPending ? "Opening..." : "Message"}
      </button>
      {error ? <span className="max-w-52 text-xs leading-5 text-red-200">{error}</span> : null}
    </span>
  );
}
