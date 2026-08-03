import { describe, expect, it } from "vitest";
import {
  buildPr27BarberSetup,
  pr27ProfilesMutuallyHidden,
  resolvePr27AccountLifecycle,
  resolvePr27AppealOutcome,
  resolvePr27CultureStanding,
  resolvePr27DeletionEligibility
} from "@/lib/trust/product-pr27-domain";

describe("Product PR27 trust and compliance contract", () => {
  it("gates go-live, kiosk, and walk-ins on all five required barber setup steps", () => {
    const setup = buildPr27BarberSetup({
      public_profile: "done",
      services_prices: "done",
      license_verification: "done",
      stripe_payouts: "done",
      shop_link_or_independent: "in_review",
      chairsync: "done"
    });

    expect(setup.canGoLive).toBe(false);
    expect(setup.kioskEligible).toBe(false);
    expect(setup.walkInEligible).toBe(false);
    expect(setup.progressPercent).toBe(63);
  });

  it("does not let optional setup steps block a barber whose required truth is complete", () => {
    const setup = buildPr27BarberSetup({
      public_profile: "done",
      services_prices: "done",
      license_verification: "done",
      stripe_payouts: "done",
      shop_link_or_independent: "done"
    });

    expect(setup.requiredComplete).toBe(true);
    expect(setup.canGoLive).toBe(true);
    expect(setup.kioskEligible).toBe(true);
    expect(setup.walkInEligible).toBe(true);
  });

  it("blocks deletion while an open booking exists", () => {
    expect(resolvePr27DeletionEligibility({
      openBookingCount: 1,
      typedConfirmation: "DELETE MY BVRB3R ACCOUNT",
      challenge: "BVR-2614",
      submittedChallenge: "BVR-2614"
    })).toMatchObject({ allowed: false, code: "open_bookings" });
  });

  it("requires the exact typed phrase and server challenge for deletion", () => {
    expect(resolvePr27DeletionEligibility({
      openBookingCount: 0,
      typedConfirmation: "delete",
      challenge: "BVR-2614",
      submittedChallenge: "BVR-2614"
    })).toMatchObject({ allowed: false, code: "confirmation_mismatch" });

    expect(resolvePr27DeletionEligibility({
      openBookingCount: 0,
      typedConfirmation: "DELETE MY BVRB3R ACCOUNT",
      challenge: "BVR-2614",
      submittedChallenge: "BVR-0000"
    })).toMatchObject({ allowed: false, code: "challenge_mismatch" });
  });

  it("restores losslessly during grace and becomes permanent after grace", () => {
    const graceEndsAt = "2026-08-28T12:00:00.000Z";
    expect(resolvePr27AccountLifecycle({
      status: "deletion_grace",
      graceEndsAt,
      now: new Date("2026-08-20T12:00:00.000Z")
    })).toMatchObject({ canRestore: true, profileVisible: false, graceExpired: false });

    expect(resolvePr27AccountLifecycle({
      status: "deletion_grace",
      graceEndsAt,
      now: new Date("2026-08-29T12:00:00.000Z")
    })).toMatchObject({ status: "deleted", canRestore: false, graceExpired: true });
  });

  it("makes a block bidirectional", () => {
    const blocks = [{
      blockerProfileId: "profile-a",
      blockedProfileId: "profile-b",
      active: true
    }];

    expect(pr27ProfilesMutuallyHidden("profile-a", "profile-b", blocks)).toBe(true);
    expect(pr27ProfilesMutuallyHidden("profile-b", "profile-a", blocks)).toBe(true);
    expect(pr27ProfilesMutuallyHidden("profile-a", "profile-c", blocks)).toBe(false);
  });

  it("applies warning, seven-day pause, then Culture-only ban", () => {
    const now = new Date("2026-07-29T12:00:00.000Z");
    const strike = (id: string, day: number) => ({
      id,
      issuedAt: `2026-07-${String(day).padStart(2, "0")}T12:00:00.000Z`,
      status: "active" as const
    });

    expect(resolvePr27CultureStanding([strike("1", 20)], now).enforcement).toBe("warning");
    expect(resolvePr27CultureStanding([strike("1", 20), strike("2", 21)], now)).toMatchObject({
      enforcement: "posting_pause",
      bookingAndMoneyUnaffected: true
    });
    expect(resolvePr27CultureStanding([strike("1", 20), strike("2", 21), strike("3", 22)], now)).toMatchObject({
      enforcement: "culture_ban",
      bookingAndMoneyUnaffected: true
    });
  });

  it("expires a strike after twelve clean months", () => {
    const standing = resolvePr27CultureStanding([{
      id: "old",
      issuedAt: "2025-06-01T00:00:00.000Z",
      status: "active"
    }], new Date("2026-07-29T00:00:00.000Z"));

    expect(standing).toMatchObject({ activeStrikeCount: 0, enforcement: "clear" });
  });

  it("requires a fresh appeal reviewer and wipes the strike when upheld", () => {
    expect(resolvePr27AppealOutcome({
      originalReviewerId: "reviewer-1",
      appealReviewerId: "reviewer-1",
      outcome: "upheld"
    })).toMatchObject({ allowed: false, code: "fresh_reviewer_required" });

    expect(resolvePr27AppealOutcome({
      originalReviewerId: "reviewer-1",
      appealReviewerId: "reviewer-2",
      outcome: "upheld"
    })).toMatchObject({ allowed: true, restoreContent: true, removeStrike: true });
  });
});
