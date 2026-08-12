import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
  beginStripeWebhookAudit,
  completeStripeWebhookAudit,
  StripeWebhookAuditError
} from "@/lib/stripe/webhook-audit";

type Row = Record<string, unknown>;

function createAuditStore() {
  const rows: Row[] = [];

  function matches(row: Row, filters: Array<[string, unknown]>) {
    return filters.every(([column, value]) => row[column] === value);
  }

  return {
    rows,
    client: {
      from(table: string) {
        expect(table).toBe("stripe_webhook_events");
        return {
          insert(values: Row) {
            return {
              select() {
                return {
                  single: async () => {
                    const duplicate = rows.some((row) =>
                      row.destination === values.destination
                      && row.stripe_event_id === values.stripe_event_id
                    );
                    if (duplicate) {
                      return { data: null, error: { code: "23505", message: "duplicate key" } };
                    }

                    const row = {
                      id: `audit-${rows.length + 1}`,
                      connected_account_id: null,
                      attempt_count: 1,
                      error_message: null,
                      processed_at: null,
                      ...values
                    };
                    rows.push(row);
                    return { data: { ...row }, error: null };
                  }
                };
              }
            };
          },
          select() {
            const filters: Array<[string, unknown]> = [];
            const query = {
              eq(column: string, value: unknown) {
                filters.push([column, value]);
                return query;
              },
              async maybeSingle() {
                const row = rows.find((candidate) => matches(candidate, filters));
                return { data: row ? { ...row } : null, error: null };
              }
            };
            return query;
          },
          update(values: Row) {
            const filters: Array<[string, unknown]> = [];
            const execute = async () => {
              const row = rows.find((candidate) => matches(candidate, filters));
              if (row) {
                Object.assign(row, values);
              }
              return { data: row ? { ...row } : null, error: null };
            };
            const query = {
              eq(column: string, value: unknown) {
                filters.push([column, value]);
                return query;
              },
              select() {
                return {
                  maybeSingle: execute
                };
              },
              then<TResult1 = { data: Row | null; error: null }, TResult2 = never>(
                onfulfilled?: ((value: { data: Row | null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
                onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
              ) {
                return execute().then(onfulfilled, onrejected);
              }
            };
            return query;
          }
        };
      }
    }
  };
}

function stripeEvent(id = "evt_audit_1") {
  return {
    id,
    type: "payment_intent.canceled",
    account: null,
    created: 1786550400,
    livemode: true,
    api_version: "2020-08-27",
    data: {
      object: {
        id: "pi_audit_1",
        object: "payment_intent",
        client_secret: "must-not-be-audited",
        metadata: { privateCustomerData: "must-not-be-audited" }
      }
    }
  } as unknown as Stripe.Event;
}

describe("Stripe webhook audit claims", () => {
  it("permits one concurrent processor and makes the competing claim retryable", async () => {
    const store = createAuditStore();
    const event = stripeEvent();

    const results = await Promise.allSettled([
      beginStripeWebhookAudit(store.client as never, "platform", event),
      beginStripeWebhookAudit(store.client as never, "platform", event)
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(StripeWebhookAuditError);
    expect((rejected.reason as StripeWebhookAuditError).status).toBe(503);
    expect(store.rows).toHaveLength(1);
  });

  it("retries a failed claim once, then suppresses later sequential duplicates", async () => {
    const store = createAuditStore();
    const event = stripeEvent("evt_retry_audit");
    const first = await beginStripeWebhookAudit(store.client as never, "platform", event);
    await completeStripeWebhookAudit(store.client as never, first.row.id, {
      processingStatus: "failed",
      attemptCount: first.row.attempt_count,
      errorMessage: "temporary database failure"
    });

    const retry = await beginStripeWebhookAudit(store.client as never, "platform", event);
    expect(retry.duplicate).toBe(false);
    expect(retry.row.attempt_count).toBe(2);
    await completeStripeWebhookAudit(store.client as never, retry.row.id, {
      processingStatus: "processed",
      attemptCount: retry.row.attempt_count
    });

    const duplicate = await beginStripeWebhookAudit(store.client as never, "platform", event);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.row.processing_status).toBe("processed");
    expect(store.rows).toHaveLength(1);
  });

  it("recovers an abandoned received claim after its processing lease expires", async () => {
    const store = createAuditStore();
    const event = stripeEvent("evt_stale_claim");
    const abandoned = await beginStripeWebhookAudit(store.client as never, "platform", event);
    store.rows[0].updated_at = "2026-08-12T11:00:00.000Z";

    const recovered = await beginStripeWebhookAudit(store.client as never, "platform", event);

    expect(recovered.duplicate).toBe(false);
    expect(recovered.row.attempt_count).toBe(2);
    expect(recovered.row.processing_status).toBe("received");
    expect(store.rows).toHaveLength(1);

    await expect(completeStripeWebhookAudit(store.client as never, abandoned.row.id, {
      processingStatus: "processed",
      attemptCount: abandoned.row.attempt_count
    })).rejects.toMatchObject({ code: "stripe_webhook_claim_lost" });

    await completeStripeWebhookAudit(store.client as never, recovered.row.id, {
      processingStatus: "processed",
      attemptCount: recovered.row.attempt_count
    });
    expect(store.rows[0].processing_status).toBe("processed");
  });

  it("returns retryable failure when finalization loses its received claim", async () => {
    const store = createAuditStore();
    const claim = await beginStripeWebhookAudit(
      store.client as never,
      "platform",
      stripeEvent("evt_lost_claim")
    );
    store.rows[0].processing_status = "processed";

    await expect(completeStripeWebhookAudit(store.client as never, claim.row.id, {
      processingStatus: "processed",
      attemptCount: claim.row.attempt_count
    })).rejects.toMatchObject({
      status: 503,
      code: "stripe_webhook_claim_lost"
    });
  });

  it("stores only a sanitized object excerpt rather than the raw Stripe payload", async () => {
    const store = createAuditStore();
    await beginStripeWebhookAudit(store.client as never, "platform", stripeEvent("evt_excerpt"));

    expect(store.rows[0].payload_excerpt).toEqual({
      id: "evt_excerpt",
      type: "payment_intent.canceled",
      created: 1786550400,
      account: null,
      objectType: "payment_intent",
      objectId: "pi_audit_1"
    });
    expect(JSON.stringify(store.rows[0])).not.toContain("must-not-be-audited");
  });

  it("keeps the same Stripe event ID independent across destination lanes", async () => {
    const store = createAuditStore();
    const event = stripeEvent("evt_lane_overlap");

    await beginStripeWebhookAudit(store.client as never, "platform", event);
    await beginStripeWebhookAudit(store.client as never, "identity", event);

    expect(store.rows.map((row) => row.destination)).toEqual(["platform", "identity"]);
  });
});
