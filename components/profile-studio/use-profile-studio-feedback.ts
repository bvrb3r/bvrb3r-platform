"use client";

import { useEffect, useState } from "react";

export type ProfileStudioFeedback = {
  tone: "info" | "success" | "error";
  message: string;
} | null;

export function useProfileStudioFeedback(autoDismissMs = 3000) {
  const [feedback, setFeedback] = useState<ProfileStudioFeedback>(null);

  useEffect(() => {
    if (!feedback || feedback.tone === "error") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setFeedback(null);
    }, autoDismissMs);

    return () => window.clearTimeout(timeoutId);
  }, [autoDismissMs, feedback]);

  return [feedback, setFeedback] as const;
}
