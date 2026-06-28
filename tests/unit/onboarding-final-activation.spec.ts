import { describe, expect, it } from "vitest";
import {
  FINAL_ACTIVATION_EVENT_HINTS,
  buildFinalActivation,
  buildFinalActivationFromContext,
  buildFinalActivationQAMatrix,
  isAllowedFinalActivationRole,
  usesOnlyApprovedFinalActivationMoreSubtitles
} from "@/lib/onboarding/final-activation";
import { buildOnboardingReadiness } from "@/lib/onboarding/readiness";
import {
  BARBER_MORE_SUBTITLES,
  CLIENT_MORE_SUBTITLES,
  SHOP_OWNER_MORE_SUBTITLES
} from "@/lib/onboarding/requirements";

const clientAccount = {
  authenticated: true,
  authMethodConnected: true,
  role: "client_user",
  name: "Jordan Ellis",
  username: "jordan",
  email: "jordan@example.com",
  phone: "8135550101",
  termsAccepted: true,
  trustRulesAccepted: true
};

const barberAccount = {
  authenticated: true,
  authMethodConnected: true,
  role: "barber_user",
  name: "Wave Carter",
  username: "wave",
  email: "wave@example.com",
  phone: "8135550102",
  termsAccepted: true,
  trustRulesAccepted: true
};

const ownerAccount = {
  authenticated: true,
  authMethodConnected: true,
  role: "shop_owner_user",
  name: "Avery Owner",
  username: "averyshop",
  email: "owner@example.com",
  phone: "8135550103",
  termsAccepted: true,
  trustRulesAccepted: true
};

const completeBarberBusiness = {
  barberRecordId: "barber-wave",
  displayName: "Wave Carter",
  username: "wave",
  safeProfilePlaceholderAllowed: true,
  activeServiceCount: 1,
  hasPrice: true,
  hasDuration: true,
  hasSchedule: true,
  bookingMode: "instant"
};

const completeShop = {
  ownerAuthority: true,
  shopRecordId: "shop-ybor",
  shopName: "BVRB3R Ybor",
  shopUsername: "bvrb3r-ybor",
  location: "123 7th Ave, Tampa, FL 33605",
  hours: "Mon-Sat",
  chairCount: 6,
  operatingModel: "mixed",
  bookingMode: "pick_barber",
  policiesAccepted: true,
  paymentModel: "barber_direct",
  verificationPosture: "approved" as const
};

describe("onboarding final activation model", () => {
  it("supports Guest, Client, Barber, and Shop Owner without creating guest as a role", () => {
    const guest = buildFinalActivationFromContext("guest", {});
    const client = buildFinalActivationFromContext("client", clientAccount);
    const barber = buildFinalActivationFromContext("barber", { ...barberAccount, barberBusiness: completeBarberBusiness });
    const owner = buildFinalActivationFromContext("shop_owner", { ...ownerAccount, shop: completeShop });

    expect(guest.userFacingRoleLabel).toBe("Guest");
    expect(guest.finalAction).toEqual({ label: "Join BVRB3R", href: "/signup?intent=client" });
    expect(isAllowedFinalActivationRole("guest_user", "guest")).toBe(false);
    expect(client.userFacingRoleLabel).toBe("Client");
    expect(barber.userFacingRoleLabel).toBe("Barber");
    expect(owner.userFacingRoleLabel).toBe("Shop Owner");
  });

  it("routes Client final action to discovery first, then Client Home when booking path is complete", () => {
    const discovery = buildFinalActivationFromContext("client", clientAccount);
    expect(discovery.progressPercent).toBe(100);
    expect(discovery.finalAction.label).toBe("Find My First Cut");
    expect(discovery.finalActionHref).toContain("/discover");

    const home = buildFinalActivationFromContext("client", clientAccount, { firstBookingExists: true });
    expect(home.finalAction).toEqual({ label: "Enter Client Home", href: "/dashboard/client" });
  });

  it("routes Barber and Shop Owner final actions to the correct Home surfaces only when required readiness passes", () => {
    const barber = buildFinalActivationFromContext("barber", { ...barberAccount, barberBusiness: completeBarberBusiness });
    expect(barber.progressPercent).toBe(100);
    expect(barber.finalAction).toEqual({ label: "Enter Barber Home", href: "/dashboard/barber" });

    const owner = buildFinalActivationFromContext("shop_owner", { ...ownerAccount, shop: completeShop });
    expect(owner.progressPercent).toBe(100);
    expect(owner.finalAction).toEqual({ label: "Enter Owner Home", href: "/dashboard/owner" });
  });

  it("blocks cross-role final activation with plain reasons and safe next actions", () => {
    const nonClient = buildFinalActivationFromContext("client", barberAccount);
    const nonBarber = buildFinalActivationFromContext("barber", clientAccount);
    const nonOwner = buildFinalActivationFromContext("shop_owner", clientAccount);

    [nonClient, nonBarber, nonOwner].forEach((result) => {
      expect(result.isFinalActivationAllowed).toBe(false);
      expect(result.progressPercent).toBeLessThan(100);
      expect(result.blockedReasons[0]).toMatchObject({
        title: "Blocked",
        nextAction: expect.objectContaining({ label: "Continue where you left off" })
      });
      expect(result.blockedReasons[0]?.reason).not.toMatch(/client_user|barber_user|shop_owner_user|profiles\.role|auth\.uid/);
    });
  });

  it("never reaches 100 when critical setup is missing", () => {
    const client = buildFinalActivationFromContext("client", { authenticated: true, role: "client_user" });
    const barber = buildFinalActivationFromContext("barber", barberAccount);
    const owner = buildFinalActivationFromContext("shop_owner", ownerAccount);

    expect(client.progressPercent).toBeLessThan(100);
    expect(client.finalAction).toEqual({ label: "Finish Client Setup", href: "/onboarding/client/profile" });
    expect(barber.progressPercent).toBeLessThan(100);
    expect(barber.finalAction).toEqual({ label: "Finish Barber Setup", href: "/onboarding/barber?step=identity" });
    expect(owner.progressPercent).toBeLessThan(100);
    expect(owner.finalAction).toEqual({ label: "Finish Shop Setup", href: "/onboarding/owner?step=authority" });
  });

  it("uses PR #44 readiness data and does not fake payout, payment, or kiosk truth", () => {
    const barber = buildFinalActivation({
      targetRole: "barber",
      readiness: buildOnboardingReadiness({
        ...barberAccount,
        barberBusiness: completeBarberBusiness,
        payout: {
          paymentLaneSelected: true,
          provider: "stripe",
          providerTruthConnected: false,
          frontendOnly: true,
          identityVerified: true,
          providerPayoutStatus: "ready",
          termsAccepted: true
        }
      })
    });

    expect(barber.progressPercent).toBe(100);
    expect(barber.secondaryActions.map((action) => action.label)).toContain("Finish payout setup");
    expect(barber.readiness.readiness.payout.status).toBe("needs_review");

    const owner = buildFinalActivationFromContext("shop_owner", {
      ...ownerAccount,
      shop: completeShop,
      kiosk: {
        shopActive: true,
        chairsActive: false,
        teamEligible: true,
        bookingModeSet: true,
        walkInModeSet: true,
        sessionRules: true,
        rotationMode: true,
        notificationSetup: true
      }
    });
    expect(owner.progressPercent).toBe(100);
    expect(owner.secondaryActions.map((action) => action.label)).toContain("Prepare kiosk");
    expect(owner.readiness.readiness.kiosk.status).toBe("needs_setup");
  });

  it("blocks unsupported booking modes and exposes retry states without duplicate-create claims", () => {
    const result = buildFinalActivationFromContext("barber", { ...barberAccount, barberBusiness: completeBarberBusiness }, {
      unsupportedBookingModeSelected: true,
      retry: {
        retryKey: "schedule-save",
        failed: true,
        reason: "Schedule save failed. Try again.",
        href: "/onboarding/barber?step=schedule"
      }
    });

    expect(result.blockedReasons.map((reason) => reason.reason)).toContain("This booking mode is not ready for V1 activation.");
    expect(result.retryableActions).toEqual([{
      label: "Try again",
      retryKey: "schedule-save",
      reason: "Schedule save failed. Try again.",
      href: "/onboarding/barber?step=schedule"
    }]);
    expect(result.retryableActions[0]?.reason).not.toMatch(/created|inserted|upserted/i);
  });

  it("keeps More metadata inside existing subtitle sets and final event hints typed only", () => {
    expect(usesOnlyApprovedFinalActivationMoreSubtitles(CLIENT_MORE_SUBTITLES)).toBe(true);
    expect(usesOnlyApprovedFinalActivationMoreSubtitles(BARBER_MORE_SUBTITLES)).toBe(true);
    expect(usesOnlyApprovedFinalActivationMoreSubtitles(SHOP_OWNER_MORE_SUBTITLES)).toBe(true);
    expect(usesOnlyApprovedFinalActivationMoreSubtitles(["Setup Checklist" as never])).toBe(false);
    expect(FINAL_ACTIVATION_EVENT_HINTS).toContain("onboarding_final_activation_viewed");
    expect(FINAL_ACTIVATION_EVENT_HINTS).toContain("owner_final_activation_completed");
  });

  it("builds a QA matrix without marking all rows green by default", () => {
    const rows = buildFinalActivationQAMatrix([
      buildFinalActivationFromContext("guest", {}),
      buildFinalActivationFromContext("client", clientAccount),
      buildFinalActivationFromContext("barber", barberAccount),
      buildFinalActivationFromContext("shop_owner", ownerAccount)
    ]);

    expect(rows).toHaveLength(4);
    expect(rows.find((row) => row.role === "Guest")?.finalAction).toBe("Pass");
    expect(rows.find((row) => row.role === "Barber")?.businessReadiness).toBe("Needs setup");
    expect(rows.find((row) => row.role === "Shop Owner")?.shopReadiness).toBe("Needs setup");
    rows.forEach((row) => {
      expect(row.noBackendLabels).toBe("Pass");
      expect(row.noFakeMoneyPayoutKioskTruth).toBe("Pass");
    });
  });
});
