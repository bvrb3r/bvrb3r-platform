import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const {
  createSupabaseAdminClientMock,
  verifyStripeConnectWebhookEventMock,
  retrieveStripeConnectedAccountMock,
  retrieveStripeConnectedAccountPayoutMock,
  beginStripeWebhookAuditMock,
  completeStripeWebhookAuditMock,
  syncStripeConnectVerificationLaneMock,
  processStripeBillingWebhookEventMock,
  processGiftCardStripeEventMock
} = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
  verifyStripeConnectWebhookEventMock: vi.fn(),
  retrieveStripeConnectedAccountMock: vi.fn(),
  retrieveStripeConnectedAccountPayoutMock: vi.fn(),
  beginStripeWebhookAuditMock: vi.fn(),
  completeStripeWebhookAuditMock: vi.fn(),
  syncStripeConnectVerificationLaneMock: vi.fn(),
  processStripeBillingWebhookEventMock: vi.fn(),
  processGiftCardStripeEventMock: vi.fn()
}));

vi.mock("@/lib/config/runtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/runtime")>("@/lib/config/runtime");
  return { ...actual, isSupabaseEnabled: () => true };
});

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/lib/stripe/connect", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe/connect")>("@/lib/stripe/connect");
  return {
    ...actual,
    verifyStripeConnectWebhookEvent: verifyStripeConnectWebhookEventMock,
    retrieveStripeConnectedAccount: retrieveStripeConnectedAccountMock,
    retrieveStripeConnectedAccountPayout: retrieveStripeConnectedAccountPayoutMock
  };
});

vi.mock("@/lib/stripe/webhook-audit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe/webhook-audit")>("@/lib/stripe/webhook-audit");
  return {
    ...actual,
    beginStripeWebhookAudit: beginStripeWebhookAuditMock,
    completeStripeWebhookAudit: completeStripeWebhookAuditMock
  };
});

vi.mock("@/lib/trust/provider-sync", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trust/provider-sync")>("@/lib/trust/provider-sync");
  return { ...actual, syncStripeConnectVerificationLane: syncStripeConnectVerificationLaneMock };
});

vi.mock("@/lib/monetization/service", () => ({
  processStripeBillingWebhookEvent: processStripeBillingWebhookEventMock
}));

vi.mock("@/lib/gift-cards/service", () => ({
  processGiftCardStripeEvent: processGiftCardStripeEventMock
}));

import { processStripeConnectWebhook } from "@/lib/fintech/service";
import { StripeWebhookAuditError } from "@/lib/stripe/webhook-audit";

const CONNECTED_ACCOUNT_ID = "connected-account-1";
const PROVIDER_ACCOUNT_ID = "acct_connected_1";

function connectedAccountRow(): Row {
  return {
    id: CONNECTED_ACCOUNT_ID,
    subject_type: "barber",
    barber_id: "barber-1",
    shop_id: null,
    provider: "stripe_connect",
    provider_account_id: PROVIDER_ACCOUNT_ID,
    onboarding_status: "verified",
    payout_readiness_status: "ready",
    legal_readiness_status: "accepted",
    tax_readiness_status: "verified",
    requirements_currently_due: [],
    requirements_eventually_due: [],
    requirements_past_due: [],
    disabled_reason: null,
    charges_enabled: false,
    payouts_enabled: true,
    last_checked_at: "2026-08-12T12:00:00.000Z",
    onboarding_started_at: "2026-08-12T11:00:00.000Z",
    onboarding_completed_at: "2026-08-12T11:30:00.000Z",
    processor_last_synced_at: "2026-08-12T12:00:00.000Z",
    processor_last_event_id: null,
    processor_last_event_type: null,
    provider_payout_block_reason: null,
    provider_payout_blocked_at: null,
    provider_payout_block_destination_id: null,
    provider_payout_block_currency: null,
    provider_payout_block_cleared_at: null,
    dashboard_last_accessed_at: null,
    created_by: "profile-1",
    created_at: "2026-08-12T11:00:00.000Z",
    updated_at: "2026-08-12T12:00:00.000Z"
  };
}

function stripeAccount() {
  return {
    id: PROVIDER_ACCOUNT_ID,
    object: "account",
    details_submitted: true,
    charges_enabled: false,
    payouts_enabled: true,
    requirements: {
      currently_due: [],
      eventually_due: [],
      past_due: [],
      disabled_reason: null
    },
    future_requirements: { eventually_due: [] }
  };
}

function createSupabaseStub(accountOverrides: Row = {}) {
  let account = { ...connectedAccountRow(), ...accountOverrides };
  const payouts: Row[] = [];
  const payoutStatusRank: Record<string, number> = {
    pending: 1,
    in_transit: 2,
    paid: 3,
    canceled: 4,
    failed: 5
  };

  function filteredQuery(rows: Row[]) {
    const filters: Array<[string, unknown]> = [];
    const query = {
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return query;
      },
      async maybeSingle() {
        const row = rows.find((candidate) => filters.every(([column, value]) => candidate[column] === value));
        return { data: row ? { ...row } : null, error: null };
      }
    };
    return query;
  }

  return {
    state: {
      get account() {
        return account;
      },
      payouts
    },
    client: {
      rpc(name: string, values: Row) {
        return {
          async maybeSingle() {
            if (name === "clear_connected_account_payout_block") {
              const matches = account.id === values.p_connected_account_id
                && account.provider_payout_blocked_at === values.p_expected_blocked_at
                && account.provider_payout_block_destination_id === values.p_expected_destination_id
                && Date.parse(String(values.p_clear_event_at)) >= Date.parse(String(account.provider_payout_blocked_at));
              if (!matches) {
                return { data: null, error: null };
              }
              account = {
                ...account,
                provider_payout_block_reason: null,
                provider_payout_blocked_at: null,
                provider_payout_block_destination_id: null,
                provider_payout_block_currency: null,
                provider_payout_block_cleared_at: values.p_clear_event_at
              };
              return { data: { ...account }, error: null };
            }

            if (name === "apply_connected_account_payout_block") {
              const eventAt = Date.parse(String(values.p_event_at));
              const blockedAt = account.provider_payout_blocked_at
                ? Date.parse(String(account.provider_payout_blocked_at))
                : Number.NEGATIVE_INFINITY;
              const clearedAt = account.provider_payout_block_cleared_at
                ? Date.parse(String(account.provider_payout_block_cleared_at))
                : Number.NEGATIVE_INFINITY;
              if (eventAt <= blockedAt || eventAt <= clearedAt) {
                return { data: null, error: null };
              }
              account = {
                ...account,
                provider_payout_block_reason: values.p_reason,
                provider_payout_blocked_at: values.p_event_at,
                provider_payout_block_destination_id: values.p_destination_id,
                provider_payout_block_currency: values.p_currency,
                payout_readiness_status: "blocked"
              };
              return { data: { ...account }, error: null };
            }

            throw new Error(`Unexpected RPC ${name}`);
          }
        };
      },
      from(table: string) {
        if (table === "connected_accounts") {
          return {
            select() {
              return filteredQuery([account]);
            },
            update(values: Row) {
              const query = {
                eq() {
                  return query;
                },
                select() {
                  return {
                    single: async () => {
                      account = { ...account, ...values };
                      return { data: { ...account }, error: null };
                    }
                  };
                },
                then<TResult1 = { error: null }, TResult2 = never>(
                  onfulfilled?: ((value: { error: null }) => TResult1 | PromiseLike<TResult1>) | null,
                  onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
                ) {
                  account = { ...account, ...values };
                  return Promise.resolve({ error: null }).then(onfulfilled, onrejected);
                }
              };
              return query;
            }
          };
        }

        if (table === "legal_acceptances") {
          return {
            select() {
              return {
                in() {
                  return {
                    order: async () => ({ data: [], error: null })
                  };
                }
              };
            }
          };
        }

        if (table === "connected_account_payouts") {
          return {
            select() {
              return filteredQuery(payouts);
            },
            async upsert(values: Row) {
              const existing = payouts.find((row) =>
                row.connected_account_id === values.connected_account_id
                && row.provider_payout_id === values.provider_payout_id
              );
              if (existing) {
                const incomingAt = Date.parse(String(values.last_event_created_at));
                const existingAt = Date.parse(String(existing.last_event_created_at));
                const incomingRank = payoutStatusRank[String(values.payout_status)] ?? 0;
                const existingRank = payoutStatusRank[String(existing.payout_status)] ?? 0;
                if (incomingAt > existingAt || (incomingAt === existingAt && incomingRank >= existingRank)) {
                  Object.assign(existing, values);
                }
              } else {
                payouts.push({ ...values });
              }
              return { error: null };
            }
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }
    }
  };
}

function connectEvent(type: string, overrides: Row = {}) {
  return {
    id: `evt_${type.replaceAll(".", "_")}`,
    type,
    account: PROVIDER_ACCOUNT_ID,
    created: 1786550400,
    livemode: true,
    api_version: "2020-08-27",
    data: { object: { id: type.startsWith("payout.") ? "po_1" : "object_1", object: "event_object" } },
    ...overrides
  };
}

function stripePayout(status: string, overrides: Row = {}) {
  return {
    id: "po_1",
    object: "payout",
    status,
    amount: 5000,
    currency: "usd",
    arrival_date: 1786636800,
    automatic: true,
    method: "standard",
    type: "bank_account",
    destination: "ba_opaque_1",
    balance_transaction: "txn_1",
    failure_balance_transaction: status === "failed" ? "txn_failure_1" : null,
    failure_code: status === "failed" ? "account_closed" : null,
    failure_message: status === "failed" ? "The bank account is closed." : null,
    livemode: true,
    created: 1786550300,
    ...overrides
  };
}

describe("Stripe Connect webhook processor", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    verifyStripeConnectWebhookEventMock.mockReset();
    retrieveStripeConnectedAccountMock.mockReset();
    retrieveStripeConnectedAccountPayoutMock.mockReset();
    beginStripeWebhookAuditMock.mockReset();
    completeStripeWebhookAuditMock.mockReset();
    syncStripeConnectVerificationLaneMock.mockReset();
    processStripeBillingWebhookEventMock.mockReset();
    processGiftCardStripeEventMock.mockReset();
    beginStripeWebhookAuditMock.mockResolvedValue({
      duplicate: false,
      row: { id: "connect-audit-1", processing_status: "received", attempt_count: 1 }
    });
    completeStripeWebhookAuditMock.mockResolvedValue(undefined);
    retrieveStripeConnectedAccountMock.mockResolvedValue(stripeAccount());
    syncStripeConnectVerificationLaneMock.mockResolvedValue({ degraded: false });
  });

  it.each([
    "account.updated",
    "capability.updated",
    "person.created",
    "person.updated",
    "person.deleted",
    "account.external_account.created",
    "account.external_account.updated",
    "account.external_account.deleted"
  ])("explicitly refreshes readiness for %s without invoking Platform money processors", async (eventType) => {
    const supabase = createSupabaseStub();
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);
    verifyStripeConnectWebhookEventMock.mockReturnValue(connectEvent(eventType));

    const result = await processStripeConnectWebhook("{}", "connect_signature");

    expect(result.status).toBe("processed");
    expect(retrieveStripeConnectedAccountMock).toHaveBeenCalledWith(PROVIDER_ACCOUNT_ID);
    expect(supabase.state.account.processor_last_event_type).toBe(eventType);
    expect(processStripeBillingWebhookEventMock).not.toHaveBeenCalled();
    expect(processGiftCardStripeEventMock).not.toHaveBeenCalled();
    expect(completeStripeWebhookAuditMock).toHaveBeenCalledWith(
      supabase.client,
      "connect-audit-1",
      { processingStatus: "processed", attemptCount: 1, connectedAccountId: CONNECTED_ACCOUNT_ID }
    );
  });

  it.each([
    ["payout.created", "pending"],
    ["payout.updated", "in_transit"],
    ["payout.paid", "paid"],
    ["payout.failed", "failed"],
    ["payout.canceled", "canceled"]
  ])("persists %s as connected bank-payout status %s", async (eventType, payoutStatus) => {
    const supabase = createSupabaseStub();
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);
    verifyStripeConnectWebhookEventMock.mockReturnValue(connectEvent(eventType));
    retrieveStripeConnectedAccountPayoutMock.mockResolvedValue({
      id: "po_1",
      object: "payout",
      status: payoutStatus,
      amount: 5000,
      currency: "usd",
      arrival_date: 1786636800,
      automatic: true,
      method: "standard",
      type: "bank_account",
      destination: "ba_opaque_1",
      balance_transaction: "txn_1",
      failure_balance_transaction: payoutStatus === "failed" ? "txn_failure_1" : null,
      failure_code: payoutStatus === "failed" ? "account_closed" : null,
      failure_message: payoutStatus === "failed" ? "The bank account is closed." : null,
      livemode: true,
      created: 1786550300
    });

    const result = await processStripeConnectWebhook("{}", "connect_signature");

    expect(result.status).toBe("processed");
    expect(supabase.state.payouts).toHaveLength(1);
    expect(supabase.state.payouts[0]).toMatchObject({
      provider_account_id: PROVIDER_ACCOUNT_ID,
      provider_payout_id: "po_1",
      payout_status: payoutStatus,
      amount_cents: 5000,
      destination_external_account_id: "ba_opaque_1"
    });
    if (payoutStatus === "failed") {
      expect(supabase.state.account.payout_readiness_status).toBe("blocked");
      expect(supabase.state.account.provider_payout_block_reason).toMatch(/bank payout failed/i);
      expect(supabase.state.account.provider_payout_block_destination_id).toBe("ba_opaque_1");
      expect(supabase.state.account.provider_payout_block_currency).toBe("usd");
    }
    expect(processStripeBillingWebhookEventMock).not.toHaveBeenCalled();
    expect(processGiftCardStripeEventMock).not.toHaveBeenCalled();
  });

  it("audits an unsupported signed Connect event as ignored", async () => {
    const supabase = createSupabaseStub();
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);
    verifyStripeConnectWebhookEventMock.mockReturnValue(connectEvent("balance.available"));

    const result = await processStripeConnectWebhook("{}", "connect_signature");

    expect(result.status).toBe("ignored");
    expect(retrieveStripeConnectedAccountMock).not.toHaveBeenCalled();
    expect(completeStripeWebhookAuditMock).toHaveBeenCalledWith(
      supabase.client,
      "connect-audit-1",
      { processingStatus: "ignored", attemptCount: 1 }
    );
  });

  it("clears a payout failure only when the affected external account is updated after the failure", async () => {
    const supabase = createSupabaseStub({
      payout_readiness_status: "blocked",
      provider_payout_block_reason: "Stripe bank payout failed.",
      provider_payout_blocked_at: "2026-08-12T12:00:00.000Z",
      provider_payout_block_destination_id: "ba_affected",
      provider_payout_block_currency: "usd"
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);
    verifyStripeConnectWebhookEventMock
      .mockReturnValueOnce(connectEvent("account.external_account.updated", {
        id: "evt_unrelated_bank",
        created: 1786550460,
        data: { object: { id: "ba_unrelated", object: "bank_account", currency: "usd", default_for_currency: false, status: "verified" } }
      }))
      .mockReturnValueOnce(connectEvent("account.external_account.updated", {
        id: "evt_affected_bank",
        created: 1786550520,
        data: { object: { id: "ba_affected", object: "bank_account", currency: "usd", default_for_currency: true, status: "verified" } }
      }));
    beginStripeWebhookAuditMock
      .mockResolvedValueOnce({ duplicate: false, row: { id: "audit-unrelated", processing_status: "received", attempt_count: 1 } })
      .mockResolvedValueOnce({ duplicate: false, row: { id: "audit-affected", processing_status: "received", attempt_count: 1 } });

    await processStripeConnectWebhook("{}", "connect_signature");
    expect(supabase.state.account.provider_payout_block_reason).toMatch(/bank payout failed/i);

    await processStripeConnectWebhook("{}", "connect_signature");
    expect(supabase.state.account.provider_payout_block_reason).toBeNull();
    expect(supabase.state.account.provider_payout_block_destination_id).toBeNull();
    expect(supabase.state.account.provider_payout_block_currency).toBeNull();
    expect(supabase.state.account.provider_payout_block_cleared_at).toBe("2026-08-12T16:02:00.000Z");
  });

  it("keeps a failed destination blocked when Stripe emits its failure-generated errored update", async () => {
    const supabase = createSupabaseStub({
      payout_readiness_status: "blocked",
      provider_payout_block_reason: "Stripe bank payout failed.",
      provider_payout_blocked_at: "2026-08-12T12:00:00.000Z",
      provider_payout_block_destination_id: "ba_affected",
      provider_payout_block_currency: "usd"
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);
    verifyStripeConnectWebhookEventMock
      .mockReturnValueOnce(connectEvent("account.external_account.updated", {
        id: "evt_failure_generated_bank_update",
        created: 1786550460,
        data: { object: { id: "ba_affected", object: "bank_account", currency: "usd", default_for_currency: true, status: "errored" } }
      }))
      .mockReturnValueOnce(connectEvent("account.external_account.updated", {
        id: "evt_repaired_bank_update",
        created: 1786550520,
        data: { object: { id: "ba_affected", object: "bank_account", currency: "usd", default_for_currency: true, status: "validated" } }
      }));
    beginStripeWebhookAuditMock
      .mockResolvedValueOnce({ duplicate: false, row: { id: "audit-errored", processing_status: "received", attempt_count: 1 } })
      .mockResolvedValueOnce({ duplicate: false, row: { id: "audit-repaired", processing_status: "received", attempt_count: 1 } });

    await processStripeConnectWebhook("{}", "connect_signature");
    expect(supabase.state.account).toMatchObject({
      provider_payout_block_reason: "Stripe bank payout failed.",
      payout_readiness_status: "blocked"
    });

    await processStripeConnectWebhook("{}", "connect_signature");
    expect(supabase.state.account.provider_payout_block_reason).toBeNull();
    expect(supabase.state.account.provider_payout_block_cleared_at).toBe("2026-08-12T16:02:00.000Z");
  });

  it("does not let a delayed historical payout failure re-block a repaired account", async () => {
    const supabase = createSupabaseStub({
      provider_payout_block_cleared_at: "2026-08-12T17:00:00.000Z"
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);
    verifyStripeConnectWebhookEventMock.mockReturnValue(connectEvent("payout.failed", {
      created: 1786550400
    }));
    retrieveStripeConnectedAccountPayoutMock.mockResolvedValue({
      id: "po_1",
      object: "payout",
      status: "failed",
      amount: 5000,
      currency: "usd",
      arrival_date: 1786636800,
      automatic: true,
      method: "standard",
      type: "bank_account",
      destination: "ba_affected",
      balance_transaction: "txn_1",
      failure_balance_transaction: "txn_failure_1",
      failure_code: "account_closed",
      failure_message: "The bank account is closed.",
      livemode: true,
      created: 1786550300
    });

    await processStripeConnectWebhook("{}", "connect_signature");

    expect(supabase.state.account.provider_payout_block_reason).toBeNull();
    expect(supabase.state.account.payout_readiness_status).not.toBe("blocked");
  });

  it("does not let an older payout failure replace a newer active payout block", async () => {
    const newerBlockedAt = "2026-08-12T18:00:00.000Z";
    const supabase = createSupabaseStub({
      payout_readiness_status: "blocked",
      provider_payout_block_reason: "Newer Stripe bank payout failed.",
      provider_payout_blocked_at: newerBlockedAt,
      provider_payout_block_destination_id: "ba_newer",
      provider_payout_block_currency: "cad"
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);
    verifyStripeConnectWebhookEventMock.mockReturnValue(connectEvent("payout.failed", {
      id: "evt_older_failure",
      created: 1786550400
    }));
    retrieveStripeConnectedAccountPayoutMock.mockResolvedValue(stripePayout("failed", {
      destination: "ba_older",
      currency: "usd"
    }));

    await processStripeConnectWebhook("{}", "connect_signature");

    expect(supabase.state.account).toMatchObject({
      provider_payout_block_reason: "Newer Stripe bank payout failed.",
      provider_payout_blocked_at: newerBlockedAt,
      provider_payout_block_destination_id: "ba_newer",
      provider_payout_block_currency: "cad"
    });
  });

  it.each([
    ["an older", 1786550460],
    ["an equal-timestamp", 1786550520]
  ])("does not let %s paid delivery regress a failed payout snapshot", async (_label, paidEventCreated) => {
    const supabase = createSupabaseStub();
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);
    verifyStripeConnectWebhookEventMock
      .mockReturnValueOnce(connectEvent("payout.failed", {
        id: "evt_newer_failure",
        created: 1786550520
      }))
      .mockReturnValueOnce(connectEvent("payout.paid", {
        id: "evt_stale_paid",
        created: paidEventCreated
      }));
    retrieveStripeConnectedAccountPayoutMock
      .mockResolvedValueOnce(stripePayout("failed", { destination: "ba_failed" }))
      .mockResolvedValueOnce(stripePayout("paid", { destination: "ba_failed" }));
    beginStripeWebhookAuditMock
      .mockResolvedValueOnce({
        duplicate: false,
        row: { id: "audit-newer-failure", processing_status: "received", attempt_count: 1 }
      })
      .mockResolvedValueOnce({
        duplicate: false,
        row: { id: "audit-stale-paid", processing_status: "received", attempt_count: 1 }
      });

    await processStripeConnectWebhook("{}", "connect_signature");
    await processStripeConnectWebhook("{}", "connect_signature");

    expect(supabase.state.payouts).toHaveLength(1);
    expect(supabase.state.payouts[0]).toMatchObject({
      provider_payout_id: "po_1",
      payout_status: "failed",
      last_event_id: "evt_newer_failure",
      last_event_type: "payout.failed"
    });
    expect(supabase.state.account).toMatchObject({
      provider_payout_block_destination_id: "ba_failed",
      payout_readiness_status: "blocked"
    });
  });

  it("suppresses a sequential account-event duplicate before readiness is synced twice", async () => {
    const supabase = createSupabaseStub();
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);
    verifyStripeConnectWebhookEventMock.mockReturnValue(connectEvent("account.updated"));
    beginStripeWebhookAuditMock
      .mockResolvedValueOnce({
        duplicate: false,
        row: { id: "connect-audit-account-duplicate", processing_status: "received", attempt_count: 1 }
      })
      .mockResolvedValueOnce({
        duplicate: true,
        row: { id: "connect-audit-account-duplicate", processing_status: "processed", attempt_count: 1 }
      });

    const first = await processStripeConnectWebhook("{}", "connect_signature");
    const duplicate = await processStripeConnectWebhook("{}", "connect_signature");

    expect(first).toMatchObject({ duplicate: false, status: "processed" });
    expect(duplicate).toMatchObject({ duplicate: true, status: "processed" });
    expect(retrieveStripeConnectedAccountMock).toHaveBeenCalledTimes(1);
    expect(syncStripeConnectVerificationLaneMock).toHaveBeenCalledTimes(1);
    expect(supabase.state.account.processor_last_event_type).toBe("account.updated");
    expect(completeStripeWebhookAuditMock).toHaveBeenCalledTimes(1);
  });

  it("allows only one concurrent payout delivery to persist bank-payout state", async () => {
    const supabase = createSupabaseStub();
    let claimed = false;
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);
    verifyStripeConnectWebhookEventMock.mockReturnValue(connectEvent("payout.paid"));
    beginStripeWebhookAuditMock.mockImplementation(async () => {
      if (claimed) {
        throw new StripeWebhookAuditError(
          "This Stripe webhook event is already being processed.",
          503,
          "stripe_webhook_in_progress"
        );
      }
      claimed = true;
      return {
        duplicate: false,
        row: { id: "connect-audit-payout-concurrent", processing_status: "received", attempt_count: 1 }
      };
    });
    retrieveStripeConnectedAccountPayoutMock.mockResolvedValue({
      id: "po_1",
      object: "payout",
      status: "paid",
      amount: 5000,
      currency: "usd",
      arrival_date: 1786636800,
      automatic: true,
      method: "standard",
      type: "bank_account",
      destination: "ba_opaque_1",
      balance_transaction: "txn_1",
      failure_balance_transaction: null,
      failure_code: null,
      failure_message: null,
      livemode: true,
      created: 1786550300
    });

    const results = await Promise.allSettled([
      processStripeConnectWebhook("{}", "connect_signature"),
      processStripeConnectWebhook("{}", "connect_signature")
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 503 });
    expect(retrieveStripeConnectedAccountPayoutMock).toHaveBeenCalledTimes(1);
    expect(supabase.state.payouts).toHaveLength(1);
    expect(supabase.state.payouts[0]).toMatchObject({
      provider_payout_id: "po_1",
      payout_status: "paid"
    });
    expect(completeStripeWebhookAuditMock).toHaveBeenCalledTimes(1);
  });

  it("marks the Connect audit failed and remains retryable when verification persistence degrades", async () => {
    const supabase = createSupabaseStub();
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);
    verifyStripeConnectWebhookEventMock.mockReturnValue(connectEvent("account.updated"));
    syncStripeConnectVerificationLaneMock.mockResolvedValue({ degraded: true });

    await expect(
      processStripeConnectWebhook("{}", "connect_signature")
    ).rejects.toMatchObject({
      status: 503,
      message: "Stripe Connect verification state could not be persisted durably."
    });

    expect(completeStripeWebhookAuditMock).toHaveBeenCalledWith(
      supabase.client,
      "connect-audit-1",
      {
        processingStatus: "failed",
        attemptCount: 1,
        errorMessage: "Stripe Connect verification state could not be persisted durably."
      }
    );
    expect(completeStripeWebhookAuditMock).not.toHaveBeenCalledWith(
      supabase.client,
      "connect-audit-1",
      expect.objectContaining({ processingStatus: "processed" })
    );
  });
});
