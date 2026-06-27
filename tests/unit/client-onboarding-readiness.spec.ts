import { describe, expect, it } from "vitest";
import {
  CLIENT_ONBOARDING_EVENT_HINTS,
  CLIENT_ONBOARDING_MORE_METADATA,
  buildClientOnboardingReadiness,
  getClientFirstBookingHref,
  usesOnlyApprovedClientMoreSubtitles
} from "@/lib/onboarding/client-path";

describe("client onboarding readiness path", () => {
  it("keeps Client Account Ready gated until username, contact, and trust proof exist", () => {
    const missing = buildClientOnboardingReadiness({
      authenticated: true,
      role: "client_user",
      fullName: "Jordan Ellis",
      username: "jordan",
      usernameAvailable: false,
      email: "jordan@example.com",
      phone: "8135550101",
      trustRulesAccepted: true
    });

    expect(missing.readiness.account.status).toBe("needs_setup");
    expect(missing.readiness.account.missingRequirements.map((requirement) => requirement.label)).toContain("Claim your BVRB3R name");
    expect(missing.canEnterDashboard).toBe(false);

    const ready = buildClientOnboardingReadiness({
      authenticated: true,
      role: "client_user",
      fullName: "Jordan Ellis",
      username: "jordan",
      usernameAvailable: true,
      email: "jordan@example.com",
      phone: "8135550101",
      trustRulesAccepted: true
    });

    expect(ready.readiness.account.status).toBe("pass");
    expect(ready.canEnterDashboard).toBe(true);
  });

  it("requires both email and phone for the Client contact readiness branch", () => {
    const emailOnly = buildClientOnboardingReadiness({
      authenticated: true,
      role: "client_user",
      fullName: "Jordan Ellis",
      username: "jordan",
      usernameAvailable: true,
      email: "jordan@example.com",
      phone: "",
      trustRulesAccepted: true
    });

    expect(emailOnly.readiness.account.status).toBe("needs_setup");
    expect(emailOnly.readiness.account.missingRequirements.map((requirement) => requirement.label)).toContain("Add email or phone");
  });

  it("uses the shared PR44 Booking Ready gate without requiring card for browsing", () => {
    const browsing = buildClientOnboardingReadiness({
      authenticated: true,
      role: "client_user",
      fullName: "Jordan Ellis",
      username: "jordan",
      usernameAvailable: true,
      email: "jordan@example.com",
      phone: "8135550101",
      trustRulesAccepted: true
    });

    expect(browsing.readiness.browse.status).toBe("pass");
    expect(browsing.readiness.booking.status).toBe("needs_setup");
    expect(browsing.readiness.booking.missingRequirements.map((requirement) => requirement.label)).toEqual(expect.arrayContaining([
      "Choose a barber or shop",
      "Choose a service",
      "Choose a time",
      "Accept booking policy"
    ]));
    expect(browsing.readiness.booking.missingRequirements.map((requirement) => requirement.label)).not.toContain("Add a payment method");

    const paidBooking = buildClientOnboardingReadiness({
      authenticated: true,
      role: "client_user",
      fullName: "Jordan Ellis",
      username: "jordan",
      usernameAvailable: true,
      email: "jordan@example.com",
      phone: "8135550101",
      trustRulesAccepted: true
    }, {
      selectedProviderId: "barber-wave",
      selectedServiceId: "srv-cut",
      selectedTime: "2026-07-01T15:00:00.000Z",
      paymentRequired: true,
      policyAccepted: true,
      serverProofConnected: true
    });

    expect(paidBooking.readiness.booking.status).toBe("needs_setup");
    expect(paidBooking.readiness.booking.missingRequirements.map((requirement) => requirement.label)).toContain("Add a payment method");
  });

  it("routes first booking mission to existing discovery or Client Home surfaces", () => {
    expect(getClientFirstBookingHref({
      serviceInterest: "haircut",
      bookingTiming: "today",
      searchPriority: "highest_rated",
      firstBookingMission: "find_first_cut"
    })).toBe("/discover?entry=client_onboarding&source=client_onboarding&type=barbers&category=haircuts&availability=today&rating=4.5");

    expect(getClientFirstBookingHref({
      serviceInterest: "not_sure_yet",
      bookingTiming: "just_browsing",
      searchPriority: "closest_to_me",
      firstBookingMission: "enter_client_home"
    })).toBe("/dashboard/client");
  });

  it("keeps Client More metadata inside the existing subtitle set only", () => {
    expect(usesOnlyApprovedClientMoreSubtitles()).toBe(true);
    expect(CLIENT_ONBOARDING_MORE_METADATA.map((entry) => entry.subtitle)).toEqual(expect.arrayContaining([
      "BVRB3R App Settings",
      "Payments & Banking",
      "Compliance & Security"
    ]));
    expect(CLIENT_ONBOARDING_MORE_METADATA.map((entry) => entry.subtitle)).not.toEqual(expect.arrayContaining([
      "Search Preferences",
      "Booking Preferences",
      "Profile Settings",
      "Location Settings",
      "Setup Checklist"
    ]));
  });

  it("defines guest and client event hints without writing events", () => {
    expect(CLIENT_ONBOARDING_EVENT_HINTS).toEqual(expect.arrayContaining([
      "guest_surface_viewed",
      "guest_join_clicked",
      "client_setup_started",
      "client_onboarding_completed",
      "first_action_clicked"
    ]));
  });
});
