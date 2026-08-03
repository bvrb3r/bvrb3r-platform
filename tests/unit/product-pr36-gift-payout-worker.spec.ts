import { describe, expect, it, vi } from "vitest";
import type { PlatformEventInput } from "@/lib/core/platform-events";
import {
  giftCardPayoutIdempotencyKeys,
  runGiftCardPayoutWorker,
  type GiftCardPayoutCandidate,
  type GiftCardPayoutEventEvidence,
  type GiftCardPayoutProvider,
  type GiftCardPayoutRepository
} from "@/lib/gift-cards/payout-worker";

const NOW = "2026-08-03T18:00:00.000Z";

function readyCandidate(overrides: Partial<GiftCardPayoutCandidate> = {}): GiftCardPayoutCandidate {
  const candidate: GiftCardPayoutCandidate = {
    obligation: {
      id: "obligation-1",
      applicationId: "application-1",
      appointmentId: "appointment-1",
      barberId: "barber-1",
      amountCents: 4_200,
      status: "ready_for_payout"
    },
    application: {
      id: "application-1",
      giftCardId: "gift-card-1",
      appointmentId: "appointment-1",
      amountCents: 4_200,
      serviceOnly: true,
      tipAppliedCents: 0
    },
    appointment: {
      id: "appointment-1",
      status: "completed",
      completedAt: NOW
    },
    currency: "usd",
    connectedAccount: {
      id: "connected-account-1",
      barberId: "barber-1",
      provider: "stripe_connect",
      providerAccountId: "acct_ready_1",
      onboardingStatus: "verified",
      payoutReadinessStatus: "ready",
      legalReadinessStatus: "accepted",
      taxReadinessStatus: "verified",
      requirementsCurrentlyDue: [],
      requirementsPastDue: [],
      disabledReason: null,
      chargesEnabled: true,
      payoutsEnabled: true
    }
  };
  return { ...candidate, ...overrides };
}

function eventEvidence(event: PlatformEventInput): GiftCardPayoutEventEvidence {
  if (!event.idempotencyKey) throw new Error("Test events require an idempotency key.");
  return {
    eventType: event.eventType,
    entityType: event.entityType,
    entityId: event.entityId,
    relatedIds: event.relatedIds ?? {},
    payload: event.payload ?? {},
    idempotencyKey: event.idempotencyKey,
    occurredAt: event.occurredAt ?? NOW
  };
}

function createRepository(
  candidate: GiftCardPayoutCandidate,
  options: { events?: GiftCardPayoutEventEvidence[]; order?: string[] } = {}
) {
  const events = new Map((options.events ?? []).map((event) => [event.idempotencyKey, event]));
  const order = options.order ?? [];
  let status = candidate.obligation.status;
  const repository: GiftCardPayoutRepository = {
    listReadyCandidates: vi.fn(async () => [{
      ...candidate,
      obligation: { ...candidate.obligation, status }
    }]),
    findEvent: vi.fn(async (idempotencyKey) => events.get(idempotencyKey) ?? null),
    recordEvent: vi.fn(async (event) => {
      order.push(`record:${event.eventType}`);
      const evidence = eventEvidence(event);
      if (!events.has(evidence.idempotencyKey)) events.set(evidence.idempotencyKey, evidence);
    }),
    transitionStatus: vi.fn(async ({ from, to }) => {
      order.push(`transition:${to}`);
      if (status === from) {
        status = to;
        return "updated";
      }
      return status === to ? "already_target" : "conflict";
    })
  };
  return { repository, events, order, status: () => status };
}

function createProvider(options: {
  availableCents?: number;
  order?: string[];
  account?: Partial<Awaited<ReturnType<GiftCardPayoutProvider["inspectConnectedAccount"]>>>;
  transfer?: Partial<Awaited<ReturnType<GiftCardPayoutProvider["createTransfer"]>>>;
} = {}) {
  const order = options.order ?? [];
  const inspectConnectedAccount = vi.fn(async (accountId: string) => ({
    id: accountId,
    deleted: false,
    detailsSubmitted: true,
    chargesEnabled: true,
    payoutsEnabled: true,
    requirementsCurrentlyDue: [],
    requirementsPastDue: [],
    disabledReason: null,
    ...options.account
  }));
  const availableCents = vi.fn(async () => options.availableCents ?? 100_000);
  const createTransfer = vi.fn(async (input: Parameters<GiftCardPayoutProvider["createTransfer"]>[0]) => {
    order.push("provider:create");
    return {
      id: "tr_gift_1",
      amountCents: input.amountCents,
      currency: input.currency,
      destinationAccountId: input.destinationAccountId,
      metadata: input.metadata,
      ...options.transfer
    };
  });
  const retrieveTransfer = vi.fn(async () => ({
    id: "tr_gift_1",
    amountCents: 4_200,
    currency: "usd",
    destinationAccountId: "acct_ready_1",
    metadata: {
      purpose: "pr36_gift_card_service_payout",
      gift_card_payout_obligation_id: "obligation-1",
      gift_card_application_id: "application-1",
      appointment_id: "appointment-1",
      barber_id: "barber-1",
      service_only: "true",
      tip_applied_cents: "0"
    }
  }));
  const provider: GiftCardPayoutProvider = {
    environmentMode: "test",
    inspectConnectedAccount,
    availableCents,
    createTransfer,
    retrieveTransfer
  };
  return { provider, inspectConnectedAccount, availableCents, createTransfer, retrieveTransfer };
}

function payoutEvidence(candidate: GiftCardPayoutCandidate) {
  const keys = giftCardPayoutIdempotencyKeys(candidate.obligation.id);
  const common = {
    entityType: "gift_card_payout_obligation",
    entityId: candidate.obligation.id,
    relatedIds: {},
    occurredAt: NOW
  };
  const plan: GiftCardPayoutEventEvidence = {
    ...common,
    eventType: "payout_eligible",
    idempotencyKey: keys.plan,
    payload: {
      obligationId: candidate.obligation.id,
      applicationId: candidate.obligation.applicationId,
      appointmentId: candidate.obligation.appointmentId,
      barberId: candidate.obligation.barberId,
      connectedAccountId: candidate.connectedAccount?.id,
      destinationAccountId: "acct_ready_1",
      amountCents: candidate.obligation.amountCents,
      currency: candidate.currency,
      provider: "stripe_connect",
      serviceOnly: true,
      tipAppliedCents: 0,
      transferIdempotencyKey: keys.transfer
    }
  };
  const release: GiftCardPayoutEventEvidence = {
    ...common,
    eventType: "payout_released",
    idempotencyKey: keys.release,
    payload: {
      processorTransferId: "tr_gift_1",
      destinationAccountId: "acct_ready_1",
      amountCents: candidate.obligation.amountCents,
      currency: candidate.currency,
      environmentMode: "test",
      serviceOnly: true,
      tipAppliedCents: 0,
      transferIdempotencyKey: keys.transfer
    }
  };
  return { keys, plan, release };
}

describe("Product PR36 gift-card payout worker", () => {
  it("records a deterministic plan and processor evidence before marking a service-only payout paid", async () => {
    const candidate = readyCandidate();
    const order: string[] = [];
    const repositoryState = createRepository(candidate, { order });
    const providerState = createProvider({ order });
    const result = await runGiftCardPayoutWorker({
      repository: repositoryState.repository,
      provider: providerState.provider,
      now: () => new Date(NOW)
    });

    expect(result).toMatchObject({ scanned: 1, paid: 1, recovered: 0, needsReview: 0, failed: 0 });
    expect(repositoryState.status()).toBe("paid");
    const keys = giftCardPayoutIdempotencyKeys(candidate.obligation.id);
    expect(providerState.createTransfer).toHaveBeenCalledWith(expect.objectContaining({
      amountCents: 4_200,
      currency: "usd",
      destinationAccountId: "acct_ready_1",
      idempotencyKey: keys.transfer,
      metadata: expect.objectContaining({
        service_only: "true",
        tip_applied_cents: "0"
      })
    }));
    expect(repositoryState.events.get(keys.release)?.payload).toMatchObject({
      processorTransferId: "tr_gift_1",
      amountCents: 4_200,
      serviceOnly: true,
      tipAppliedCents: 0,
      transferIdempotencyKey: keys.transfer
    });
    expect(order).toEqual([
      "record:payout_eligible",
      "provider:create",
      "record:payout_released",
      "transition:paid"
    ]);
  });

  it("never pays or transfers an application that touched a tip", async () => {
    const candidate = readyCandidate({
      application: {
        ...readyCandidate().application!,
        tipAppliedCents: 1
      }
    });
    const repositoryState = createRepository(candidate);
    const providerState = createProvider();
    const result = await runGiftCardPayoutWorker({
      repository: repositoryState.repository,
      provider: providerState.provider,
      now: () => new Date(NOW)
    });

    expect(result).toMatchObject({ needsReview: 1, paid: 0 });
    expect(result.items[0]).toMatchObject({ reason: "gift_application_touched_tip" });
    expect(repositoryState.status()).toBe("needs_review");
    expect(providerState.createTransfer).not.toHaveBeenCalled();
    expect(Array.from(repositoryState.events.values())).toEqual([
      expect.objectContaining({
        eventType: "payout_held",
        payload: expect.objectContaining({ tipAppliedCents: 1 })
      })
    ]);
  });

  it("leaves the obligation retryable when the verified database account is not payout-ready", async () => {
    const base = readyCandidate();
    const candidate = readyCandidate({
      connectedAccount: { ...base.connectedAccount!, payoutsEnabled: false }
    });
    const repositoryState = createRepository(candidate);
    const providerState = createProvider();
    const result = await runGiftCardPayoutWorker({
      repository: repositoryState.repository,
      provider: providerState.provider,
      now: () => new Date(NOW)
    });

    expect(result).toMatchObject({ notReady: 1, paid: 0 });
    expect(result.items[0]).toMatchObject({ reason: "connected_account_capabilities_incomplete" });
    expect(repositoryState.status()).toBe("ready_for_payout");
    expect(providerState.inspectConnectedAccount).not.toHaveBeenCalled();
    expect(providerState.createTransfer).not.toHaveBeenCalled();
  });

  it("does not create a transfer when Stripe platform balance is insufficient", async () => {
    const candidate = readyCandidate();
    const repositoryState = createRepository(candidate);
    const providerState = createProvider({ availableCents: 4_199 });
    const result = await runGiftCardPayoutWorker({
      repository: repositoryState.repository,
      provider: providerState.provider,
      now: () => new Date(NOW)
    });

    expect(result).toMatchObject({ notReady: 1, paid: 0 });
    expect(result.items[0]).toMatchObject({ reason: "platform_balance_not_available" });
    expect(repositoryState.status()).toBe("ready_for_payout");
    expect(providerState.createTransfer).not.toHaveBeenCalled();
  });

  it("recovers a recorded processor release without creating a second transfer", async () => {
    const candidate = readyCandidate();
    const evidence = payoutEvidence(candidate);
    const repositoryState = createRepository(candidate, { events: [evidence.plan, evidence.release] });
    const providerState = createProvider();
    const result = await runGiftCardPayoutWorker({
      repository: repositoryState.repository,
      provider: providerState.provider,
      now: () => new Date(NOW)
    });

    expect(result).toMatchObject({ recovered: 1, paid: 0, failed: 0 });
    expect(repositoryState.status()).toBe("paid");
    expect(providerState.retrieveTransfer).toHaveBeenCalledWith("tr_gift_1");
    expect(providerState.createTransfer).not.toHaveBeenCalled();
    expect(providerState.inspectConnectedAccount).not.toHaveBeenCalled();
  });

  it("holds a processor response mismatch for review and never marks it paid", async () => {
    const candidate = readyCandidate();
    const repositoryState = createRepository(candidate);
    const providerState = createProvider({ transfer: { amountCents: 4_199 } });
    const result = await runGiftCardPayoutWorker({
      repository: repositoryState.repository,
      provider: providerState.provider,
      now: () => new Date(NOW)
    });

    expect(result).toMatchObject({ needsReview: 1, paid: 0 });
    expect(result.items[0]).toMatchObject({ reason: "processor_transfer_amount_mismatch" });
    expect(repositoryState.status()).toBe("needs_review");
    expect(Array.from(repositoryState.events.values())).toContainEqual(expect.objectContaining({
      eventType: "payout_held",
      payload: expect.objectContaining({ reason: "processor_transfer_amount_mismatch" })
    }));
  });

  it("skips a non-ready source row even if a repository returns it unexpectedly", async () => {
    const candidate = readyCandidate({
      obligation: { ...readyCandidate().obligation, status: "pending_completion" }
    });
    const repositoryState = createRepository(candidate);
    const providerState = createProvider();
    const result = await runGiftCardPayoutWorker({
      repository: repositoryState.repository,
      provider: providerState.provider,
      now: () => new Date(NOW)
    });

    expect(result).toMatchObject({ skipped: 1, paid: 0 });
    expect(result.items[0]).toMatchObject({ reason: "obligation_not_ready" });
    expect(providerState.inspectConnectedAccount).not.toHaveBeenCalled();
    expect(providerState.createTransfer).not.toHaveBeenCalled();
  });
});
