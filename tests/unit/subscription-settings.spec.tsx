import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SubscriptionSettingsCard } from "@/components/subscription/subscription-settings-card";
import { buildStandardEntitlementTruth, type EntitlementAccountRole, type ServerEntitlementTruth } from "@/lib/entitlements/domain";
import { buildSubscriptionSettingsSummary } from "@/lib/entitlements/subscription-settings";

const forbiddenUserCopy =
  /client_user|barber_user|shop_owner_user|account_entitlements|stripe_customer_id|stripe_subscription_id|payment_intent|provider_payment_method_id|webhook_unverified|localStorage|server_default|pro_client|elite_client|pro_barber|elite_barber|pro_owner|elite_owner|owner_user|shop_admin|admin_user|guest_user/i;

function paidEntitlement(role: EntitlementAccountRole, overrides: Partial<ServerEntitlementTruth> = {}): ServerEntitlementTruth {
  return {
    profileId: `profile-${role}`,
    accountRole: role,
    tier: "pro",
    billingInterval: "monthly",
    status: "active",
    source: "stripe_webhook",
    stripeCustomerId: "cus_should_not_render",
    stripeSubscriptionId: "sub_should_not_render",
    stripePriceId: "price_should_not_render",
    currentPeriodStart: "2026-06-01T00:00:00.000Z",
    currentPeriodEnd: "2026-07-01T00:00:00.000Z",
    cancelAt: null,
    trialEnd: null,
    updatedAt: "2026-06-28T00:00:00.000Z",
    verification: {
      persistenceConnected: true,
      stripePriceMapped: true,
      webhookVerified: true,
      reasons: []
    },
    ...overrides
  };
}

function summaryFor(role: EntitlementAccountRole, entitlement: ServerEntitlementTruth) {
  const summary = buildSubscriptionSettingsSummary({
    user: { id: `profile-${role}`, role },
    entitlement
  });
  if (!summary) {
    throw new Error("Expected subscription summary.");
  }
  return summary;
}

describe("subscription settings manage plan", () => {
  it("builds role-aware current tier cards from server entitlement snapshots", () => {
    const client = summaryFor("client_user", buildStandardEntitlementTruth({ profileId: "profile-client_user", accountRole: "client_user" }));
    const barber = summaryFor("barber_user", paidEntitlement("barber_user"));
    const owner = summaryFor("shop_owner_user", paidEntitlement("shop_owner_user", { tier: "elite" }));

    expect(client).toMatchObject({
      roleLabel: "Client",
      currentTierLabel: "Standard",
      accessStateLabel: "Active"
    });
    expect(client.roleCopy).toBe("Standard costs $0 and helps clients book and manage basics. Pro and Elite unlock advanced client benefits where configured.");

    expect(barber).toMatchObject({
      roleLabel: "Barber",
      currentTierLabel: "Pro",
      accessStateLabel: "Active"
    });
    expect(barber.roleCopy).toBe("Standard costs $0 and keeps basic profile and booking setup open. Pro and Elite unlock business, retention, and growth tools where configured.");

    expect(owner).toMatchObject({
      roleLabel: "Shop Owner",
      currentTierLabel: "Elite",
      accessStateLabel: "Active"
    });
    expect(owner.roleCopy).toBe("Standard costs $0 and keeps shop setup basics open. Pro and Elite unlock team, money, kiosk, reports, and scale tools where configured.");
  });

  it("keeps missing portal configuration in a safe disabled manage-plan state", () => {
    const summary = summaryFor("client_user", paidEntitlement("client_user"));

    expect(summary.manageAction).toEqual({
      label: "Manage plan",
      href: null,
      state: "unavailable",
      unavailableReason: "Plan management is being prepared."
    });
    expect(summary.upgradeAction.state).toBe("unavailable");

    render(<SubscriptionSettingsCard summary={summary} />);

    expect(screen.getByTestId("subscription-settings-card-client")).toHaveTextContent("Pro Client plan");
    expect(screen.getAllByRole("button", { name: "Plan management is being prepared." })).toHaveLength(2);
    screen.getAllByRole("button", { name: "Plan management is being prepared." }).forEach((button) => {
      expect(button).toBeDisabled();
    });
    expect(document.body.textContent).not.toMatch(forbiddenUserCopy);
  });

  it("shows Needs Review for unsafe or unknown paid proof instead of fake paid access", () => {
    const summary = summaryFor("barber_user", paidEntitlement("barber_user", {
      source: "account_entitlements",
      verification: {
        persistenceConnected: true,
        stripePriceMapped: false,
        webhookVerified: false,
        reasons: ["stripe_customer_id is missing for account_entitlements."]
      }
    }));

    expect(summary.accessStateLabel).toBe("Needs Review");
    expect(summary.reviewReasons).toEqual(["Server plan proof needs review before paid access can unlock."]);

    render(<SubscriptionSettingsCard summary={summary} />);

    const card = screen.getByTestId("subscription-settings-card-barber");
    expect(card).toHaveTextContent("Needs Review");
    expect(card).toHaveTextContent("Server plan proof needs review before paid access can unlock.");
    expect(card.textContent).not.toMatch(forbiddenUserCopy);
  });

  it("refreshes entitlement state from the server endpoint without accepting a frontend tier", async () => {
    const initial = summaryFor("client_user", buildStandardEntitlementTruth({ profileId: "profile-client_user", accountRole: "client_user" }));
    const refreshed = summaryFor("client_user", paidEntitlement("client_user"));
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => ({
      ok: true,
      json: async () => ({ ok: true, subscription: refreshed, observedBody: init?.body })
    })) as unknown as typeof fetch;
    global.fetch = fetchMock;

    render(<SubscriptionSettingsCard summary={initial} />);

    expect(screen.getByTestId("subscription-settings-card-client")).toHaveTextContent("Standard Client plan");
    fireEvent.click(screen.getByRole("button", { name: "Refresh plan status" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/subscription/settings", expect.objectContaining({
      method: "POST"
    })));
    const body = JSON.parse(String((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.body));
    expect(body).toEqual({ action: "refresh_entitlement" });
    expect(await screen.findByText("Plan status refreshed from server truth.")).toBeInTheDocument();
    expect(screen.getByTestId("subscription-settings-card-client")).toHaveTextContent("Pro Client plan");
  });

  it("renders refresh failures without changing the card to Pass", async () => {
    const initial = summaryFor("shop_owner_user", buildStandardEntitlementTruth({
      profileId: "profile-shop_owner_user",
      accountRole: "shop_owner_user",
      persistenceConnected: false,
      reason: "Supabase entitlement persistence is not connected; paid access remains locked."
    }));
    global.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "Unable to refresh plan status." })
    })) as unknown as typeof fetch;

    render(<SubscriptionSettingsCard summary={initial} />);
    const card = screen.getByTestId("subscription-settings-card-shop_owner");

    expect(card).toHaveTextContent("Needs Review");
    fireEvent.click(within(card).getByRole("button", { name: "Refresh plan status" }));

    expect(await screen.findByText("Unable to refresh plan status.")).toBeInTheDocument();
    expect(card).toHaveTextContent("Needs Review");
  });
});
