export function isOwnerReviewMode() {
  const configured = process.env.BVRB3R_OWNER_REVIEW_MODE?.trim().toLowerCase();

  if (configured === "true") {
    return true;
  }

  if (configured === "false") {
    return false;
  }

  return process.env.VERCEL_ENV === "production";
}
