/**
 * Retired pre-doctrine data values.
 *
 * BVRB3R's locked financial doctrine supports only Full Booth Rent and
 * AutoBooth Rent (see `lib/fintech/booth-rent-doctrine.ts`). Rows written
 * before the doctrine was locked still carry retired revenue-share values, and
 * already-applied migrations still contain them. This module is the ONE place
 * in active code allowed to name those retired values, so that legacy rows can
 * be recognized and normalized rather than silently misread.
 *
 * This file is the single documented exception in the doctrine guard
 * (`scripts/verify-financial-doctrine.mjs`). Do not spread these literals into
 * other modules — import them from here.
 *
 * Normalization is deliberately fail-safe: a retired revenue-share arrangement
 * normalizes to `freelance`, never to a rent model. Converting a retired split
 * into a rent obligation would invent a debt the barber never agreed to, so the
 * shop collects nothing until owner and barber establish a real Full Booth Rent
 * or AutoBooth Rent agreement.
 */

/** Retired revenue-share relationship/compensation value. Never write this. */
export const RETIRED_REVENUE_SHARE_MODEL = "commission" as const;

/**
 * Retired revenue-share account role, a member of the historical
 * `public.app_role` enum. Identity is never a money relationship, so no
 * replacement account role exists: the doctrine models live on the
 * relationship, not on the profile. Retained only to read pre-doctrine rows.
 */
export const RETIRED_REVENUE_SHARE_ACCOUNT_ROLE = "commission_barber" as const;

export type RetiredRevenueShareModel = typeof RETIRED_REVENUE_SHARE_MODEL;
export type RetiredRevenueShareAccountRole = typeof RETIRED_REVENUE_SHARE_ACCOUNT_ROLE;

/** Every retired value that must still be recognized on read. */
export const RETIRED_REVENUE_SHARE_VALUES = [
  RETIRED_REVENUE_SHARE_MODEL,
  RETIRED_REVENUE_SHARE_ACCOUNT_ROLE
] as const;

export function isRetiredRevenueShareModel(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === RETIRED_REVENUE_SHARE_MODEL;
}

export function isRetiredRevenueShareAccountRole(value: unknown): boolean {
  return typeof value === "string" && value.trim() === RETIRED_REVENUE_SHARE_ACCOUNT_ROLE;
}
