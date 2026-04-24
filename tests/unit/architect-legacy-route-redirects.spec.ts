import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  })
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

import ArchitectAccountsPage from "@/app/(platform)/architect/accounts/page";
import ArchitectAccountDetailPage from "@/app/(platform)/architect/accounts/[profileId]/page";
import ArchitectClientsRedirectPage from "@/app/(platform)/architect/clients/page";
import ArchitectBarbersRedirectPage from "@/app/(platform)/architect/barbers/page";
import ArchitectOwnersRedirectPage from "@/app/(platform)/architect/owners/page";
import ArchitectShopOwnersRedirectPage from "@/app/(platform)/architect/shop-owners/page";
import ArchitectShopsRedirectPage from "@/app/(platform)/architect/shops/page";
import ArchitectApprovalsRedirectPage from "@/app/(platform)/architect/approvals/page";
import ArchitectVerificationQueueRedirectPage from "@/app/(platform)/architect/verification-queue/page";
import ArchitectTrustRedirectPage from "@/app/(platform)/architect/trust/page";
import ArchitectTransactionsRedirectPage from "@/app/(platform)/architect/transactions/page";
import ArchitectPayoutsRedirectPage from "@/app/(platform)/architect/payouts/page";
import ArchitectDisputesRedirectPage from "@/app/(platform)/architect/disputes/page";
import ArchitectRefundsRedirectPage from "@/app/(platform)/architect/refunds/page";
import ArchitectRevenueRedirectPage from "@/app/(platform)/architect/revenue/page";
import ArchitectSystemLogsRedirectPage from "@/app/(platform)/architect/system-logs/page";
import ArchitectAuditRedirectPage from "@/app/(platform)/architect/audit/page";
import ArchitectIntegrationsRedirectPage from "@/app/(platform)/architect/integrations/page";
import ArchitectRolesRedirectPage from "@/app/(platform)/architect/roles/page";
import ArchitectSupportRedirectPage from "@/app/(platform)/architect/support/page";
import ArchitectPlatformSettingsRedirectPage from "@/app/(platform)/architect/platform-settings/page";

describe("architect legacy route redirects", () => {
  beforeEach(() => {
    redirectMock.mockClear();
  });

  it("redirects the legacy accounts route into the new users tab and preserves filters", async () => {
    await expect(ArchitectAccountsPage({
      searchParams: Promise.resolve({
        search: "phillip",
        role: "barber",
        status: "pending_review"
      })
    })).rejects.toThrow("REDIRECT:/architect/users?search=phillip&role=barber&status=pending_review");

    await expect(ArchitectAccountDetailPage({
      params: Promise.resolve({ profileId: "profile-barber" })
    })).rejects.toThrow("REDIRECT:/architect/users/profile-barber");
  });

  it("redirects legacy user slices into the canonical users tab", () => {
    expect(() => ArchitectClientsRedirectPage()).toThrow("REDIRECT:/architect/users?role=client");
    expect(() => ArchitectBarbersRedirectPage()).toThrow("REDIRECT:/architect/users?role=barber");
    expect(() => ArchitectOwnersRedirectPage()).toThrow("REDIRECT:/architect/users?role=shop_owner");
    expect(() => ArchitectShopOwnersRedirectPage()).toThrow("REDIRECT:/architect/users?role=shop_owner");
    expect(() => ArchitectShopsRedirectPage()).toThrow("REDIRECT:/architect/users?role=shop_owner");
  });

  it("redirects legacy trust queues into Verifications", () => {
    expect(() => ArchitectApprovalsRedirectPage()).toThrow("REDIRECT:/architect/verifications");
    expect(() => ArchitectVerificationQueueRedirectPage()).toThrow("REDIRECT:/architect/verifications");
    expect(() => ArchitectTrustRedirectPage()).toThrow("REDIRECT:/architect/verifications");
  });

  it("redirects legacy financial routes into Money", () => {
    expect(() => ArchitectTransactionsRedirectPage()).toThrow("REDIRECT:/architect/money?section=transactions");
    expect(() => ArchitectPayoutsRedirectPage()).toThrow("REDIRECT:/architect/money?section=payouts");
    expect(() => ArchitectDisputesRedirectPage()).toThrow("REDIRECT:/architect/money?section=disputes");
    expect(() => ArchitectRefundsRedirectPage()).toThrow("REDIRECT:/architect/money?section=refunds");
    expect(() => ArchitectRevenueRedirectPage()).toThrow("REDIRECT:/architect/money?section=revenue");
  });

  it("redirects legacy platform tooling routes into Settings", () => {
    expect(() => ArchitectSystemLogsRedirectPage()).toThrow("REDIRECT:/architect/settings?section=logs");
    expect(() => ArchitectAuditRedirectPage()).toThrow("REDIRECT:/architect/settings?section=audit");
    expect(() => ArchitectIntegrationsRedirectPage()).toThrow("REDIRECT:/architect/settings?section=integrations");
    expect(() => ArchitectRolesRedirectPage()).toThrow("REDIRECT:/architect/settings?section=roles");
    expect(() => ArchitectSupportRedirectPage()).toThrow("REDIRECT:/architect/settings?section=support");
    expect(() => ArchitectPlatformSettingsRedirectPage()).toThrow("REDIRECT:/architect/settings");
  });
});
