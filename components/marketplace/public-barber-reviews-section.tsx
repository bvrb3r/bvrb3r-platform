"use client";

import { useMemo, useState } from "react";
import { Star, X } from "lucide-react";
import { ReportBlockSheet } from "@/components/trust/report-block-sheet";
import type { Review } from "@/types/domain";

const compactPanelClass = "rounded-lg border border-white/8 bg-white/[0.035] shadow-[0_18px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl";
const quietPanelClass = "rounded-lg border border-white/8 bg-black/25";
const labelClass = "text-xs font-bold uppercase text-white/48";

type ReviewsResponse = {
  ok?: boolean;
  averageRating?: number;
  reviewCount?: number;
  reviews?: Review[];
  error?: string;
};

type SubmitReviewResponse = {
  ok?: boolean;
  review?: Pick<Review, "id" | "rating" | "message" | "createdAt">;
  error?: string;
};

function formatReviewDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function pluralizeReviews(count: number) {
  return `${count} ${count === 1 ? "review" : "reviews"}`;
}

async function readJson<T>(response: Response): Promise<T> {
  return response.json().catch(() => ({})) as Promise<T>;
}

export function PublicBarberReviewsSection({
  barberId,
  initialReviews,
  initialAverageRating,
  initialReviewCount,
  viewerCanReview,
  viewerCanReport = viewerCanReview
}: {
  barberId: string;
  initialReviews: Review[];
  initialAverageRating: number;
  initialReviewCount: number;
  viewerCanReview: boolean;
  viewerCanReport?: boolean;
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [averageRating, setAverageRating] = useState(initialAverageRating);
  const [reviewCount, setReviewCount] = useState(initialReviewCount);
  const [modalOpen, setModalOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ratingLabel = useMemo(() => `${averageRating.toFixed(1)} rating`, [averageRating]);

  async function refreshReviews() {
    const response = await fetch(`/api/barbers/${encodeURIComponent(barberId)}/reviews`, {
      cache: "no-store"
    });
    const payload = await readJson<ReviewsResponse>(response);

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error ?? "Unable to refresh reviews.");
    }

    setReviews(payload.reviews ?? []);
    setAverageRating(Number(payload.averageRating ?? 0));
    setReviewCount(Number(payload.reviewCount ?? 0));
  }

  async function submitReview() {
    if (!viewerCanReview) {
      setError("Sign in as a client to leave a review.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/barbers/${encodeURIComponent(barberId)}/reviews`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          rating,
          message
        })
      });
      const payload = await readJson<SubmitReviewResponse>(response);

      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error ?? "Unable to post review.");
      }

      setModalOpen(false);
      setMessage("");
      setRating(5);
      setNotice("Review posted.");

      try {
        await refreshReviews();
      } catch {
        if (payload.review) {
          const fallbackReview: Review = {
            id: payload.review.id,
            barberId,
            clientId: "",
            locationId: "",
            rating: payload.review.rating,
            sentiment: payload.review.rating >= 5 ? "great" : payload.review.rating >= 4 ? "good" : "watch",
            message: payload.review.message ?? "",
            createdAt: payload.review.createdAt,
            reviewerName: "You"
          };
          const nextReviews = [fallbackReview, ...reviews];
          setReviews(nextReviews);
          setReviewCount(nextReviews.length);
          setAverageRating(Number((nextReviews.reduce((sum, review) => sum + review.rating, 0) / nextReviews.length).toFixed(1)));
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to post review.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={`${compactPanelClass} p-4 sm:p-5`} aria-labelledby="public-barber-reviews-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={labelClass}>Reviews</p>
          <h2 id="public-barber-reviews-heading" className="mt-1 text-2xl font-black text-white">{ratingLabel}</h2>
          <p className="mt-1 text-sm text-white/48">{pluralizeReviews(reviewCount)}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setNotice(null);
            setModalOpen(true);
          }}
          className="min-h-10 rounded-lg border border-[#c4f24e]/35 bg-[#c4f24e]/12 px-4 text-sm font-black text-[#e4f9b8] transition hover:bg-[#c4f24e]/18"
        >
          Leave a Review
        </button>
      </div>

      {notice ? (
        <div className="mt-4 rounded-lg border border-[#c4f24e]/25 bg-[#c4f24e]/10 px-4 py-3 text-sm font-bold text-[#e4f9b8]">
          {notice}
        </div>
      ) : null}

      {reviews.length ? (
        <div className="mt-5 grid gap-3">
          {reviews.slice(0, 8).map((review) => (
            <article key={review.id} className={`${quietPanelClass} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-white">{review.reviewerName || "BVRB3R client"}</p>
                  <p className="mt-1 text-xs text-white/40">{formatReviewDate(review.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {viewerCanReport ? (
                    <ReportBlockSheet
                      reviewId={review.id}
                      targetLabel="review"
                      source="review"
                      canBlock={false}
                      triggerLabel="Report"
                      triggerClassName="inline-flex min-h-8 items-center gap-1 rounded-lg border border-white/10 px-2.5 text-[11px] font-bold text-white/48 transition hover:border-red-400/20 hover:text-red-100"
                    />
                  ) : null}
                  <span className="inline-flex items-center gap-1 rounded-lg border border-[#c4f24e]/15 bg-[#c4f24e]/10 px-2.5 py-1 text-sm font-black text-[#e4f9b8]">
                    <Star className="h-4 w-4 fill-current" aria-hidden="true" />
                    {review.rating.toFixed(1)}
                  </span>
                </div>
              </div>
              {review.serviceName ? (
                <p className="mt-3 text-xs font-bold uppercase text-white/42">{review.serviceName}</p>
              ) : null}
              <p className="mt-3 text-sm leading-6 text-white/68">{review.message || "This visit was reviewed."}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-5 text-sm leading-6 text-white/58">
          Reviews building.
        </div>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 p-4 backdrop-blur-sm" role="presentation">
          <div className="w-full max-w-md rounded-lg border border-white/10 bg-[#070907] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.55)]" role="dialog" aria-modal="true" aria-labelledby="leave-review-title">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={labelClass}>Community proof</p>
                <h3 id="leave-review-title" className="mt-1 text-xl font-black text-white">Leave a review</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white/70 transition hover:bg-white/8 hover:text-white"
                aria-label="Close review modal"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {!viewerCanReview ? (
              <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm leading-6 text-white/65">
                Sign in as a client to leave a review.
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <fieldset>
                  <legend className="text-sm font-bold text-white">Rating</legend>
                  <div className="mt-2 grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRating(value)}
                        className={`min-h-10 rounded-lg border px-2 text-sm font-black transition ${
                          rating === value
                            ? "border-[#c4f24e]/50 bg-[#c4f24e] text-black"
                            : "border-white/10 bg-white/[0.035] text-white/70 hover:border-white/18"
                        }`}
                        aria-pressed={rating === value}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <label className="block">
                  <span className="text-sm font-bold text-white">Share your experience</span>
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Share your experience"
                    maxLength={500}
                    className="mt-2 min-h-28 w-full resize-none rounded-lg border border-white/10 bg-black/35 px-3 py-3 text-sm text-white outline-none transition placeholder:text-white/32 focus:border-[#c4f24e]/45"
                  />
                </label>
              </div>
            )}

            {error ? (
              <div className="mt-4 rounded-lg border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">
                {error}
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="min-h-10 rounded-lg border border-white/10 px-4 text-sm font-black text-white/70 transition hover:bg-white/8 hover:text-white"
              >
                Cancel
              </button>
              {viewerCanReview ? (
                <button
                  type="button"
                  onClick={submitReview}
                  disabled={submitting}
                  className="min-h-10 rounded-lg border border-[#c4f24e]/45 bg-[#c4f24e] px-4 text-sm font-black text-black transition hover:bg-[#e4f9b8] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Posting..." : "Submit review"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
