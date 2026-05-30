"use client";

import { useState } from "react";
import { BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { useSaveFavoriteShopMutation, type BookingApiError } from "@/lib/booking/client";
import { getReadableActionError } from "@/lib/utils/feedback";

export function PublicShopFavoriteAction({
  shopId,
  canFavorite
}: {
  shopId: string;
  canFavorite: boolean;
}) {
  const favoriteMutation = useSaveFavoriteShopMutation();
  const [feedback, setFeedback] = useState<{ tone: "success" | "info" | "error"; message: string } | null>(null);

  async function handleFavorite() {
    setFeedback(null);
    try {
      await favoriteMutation.mutateAsync({ shopReference: shopId });
      setFeedback({ tone: "success", message: "This shop is now your favorite. Client discovery and next-available booking can use this real shop preference." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as BookingApiError) });
    }
  }

  if (!canFavorite) {
    return <span className="status-pill text-white/72">Favorite from a client account</span>;
  }

  return (
    <div className="space-y-3">
      {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}
      <Button type="button" variant="secondary" className="min-h-12 rounded-full px-5" disabled={favoriteMutation.isPending} onClick={() => void handleFavorite()}>
        <BookmarkCheck className="h-4 w-4" />
        {favoriteMutation.isPending ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
