import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  syncPaymentRoutingRecordMock,
  syncStripeSettlementForPaymentMock,
  reconcilePaymentPayoutExecutionsMock,
  getStripeConnectClientMock
} = vi.hoisted(() => ({
  syncPaymentRoutingRecordMock: vi.fn(),
  syncStripeSettlementForPaymentMock: vi.fn(),
  reconcilePaymentPayoutExecutionsMock: vi.fn(),
  getStripeConnectClientMock: vi.fn()
}));

vi.mock("@/lib/fintech/service", () => ({
  syncPaymentRoutingRecord: syncPaymentRoutingRecordMock,
  syncStripeSettlementForPayment: syncStripeSettlementForPaymentMock,
  reconcilePaymentPayoutExecutions: reconcilePaymentPayoutExecutionsMock
}));

vi.mock("@/lib/stripe/connect", () => ({
  StripeConnectError: class StripeConnectError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  },
  getStripeConnectClient: getStripeConnectClientMock
}));

import { createCapturedStripePaymentRecord } from "@/lib/payments/service";

function createSupabaseStub() {
  const paymentMethodRow = {
    id: "pm-local-1",
    client_id: "client-live-1",
    provider: "stripe",
    provider_customer_id: "cus_live_1",
    provider_payment_method_id: "pm_stripe_1",
    brand: "Visa",
    last4: "4242",
    exp_month: 9,
    exp_year: 2029,
    is_default: true,
    created_at: "2026-04-21T12:00:00.000Z"
  };

  let insertedPayment: Record<string, unknown> | null = null;
  const platformEvents: Array<Record<string, unknown>> = [];

  return {
    state: {
      insertedPayment,
      platformEvents
    },
    from(table: string) {
      if (table === "payment_methods") {
        return {
          select(columns: string) {
            expect(columns).toContain("provider_payment_method_id");
            return {
              eq(column: string, value: string) {
                if (column === "id") {
                  expect(value).toBe("pm-local-1");
                  return {
                    eq(secondColumn: string, secondValue: string) {
                      expect(secondColumn).toBe("client_id");
                      expect(secondValue).toBe("client-live-1");
                      return {
                        eq(thirdColumn: string, thirdValue: string) {
                          expect(thirdColumn).toBe("provider");
                          expect(thirdValue).toBe("stripe");
                          return {
                            maybeSingle: async () => ({ data: paymentMethodRow, error: null })
                          };
                        }
                      };
                    }
                  };
                }

                throw new Error(`Unexpected payment_methods column ${column}`);
              }
            };
          }
        };
      }

      if (table === "payments") {
        return {
          insert(row: Record<string, unknown>) {
            insertedPayment = row;
            return {
              select(columns: string) {
                expect(columns).toContain("provider_payment_intent_id");
                return {
                  single: async () => ({
                    data: {
                      id: "pay-live-1",
                      appointment_id: row.appointment_id,
                      client_id: row.client_id,
                      shop_id: row.shop_id,
                      barber_id: row.barber_id,
                      payment_method_id: row.payment_method_id,
                      provider: row.provider,
                      provider_payment_intent_id: row.provider_payment_intent_id,
                      amount: row.amount,
                      currency: row.currency,
                      payment_status: row.payment_status,
                      payment_type: row.payment_type,
                      paid_at: row.paid_at,
                      created_at: row.created_at
                    },
                    error: null
                  })
                };
              }
            };
          }
        };
      }

      if (table === "platform_events") {
        return {
          upsert(row: Record<string, unknown>) {
            platformEvents.push(row);
            return Promise.resolve({ error: null });
          },
          insert(row: Record<string, unknown>) {
            platformEvents.push(row);
            return Promise.resolve({ error: null });
          }
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }
  };
}

describe("stripe payment record creation", () => {
  beforeEach(() => {
    syncPaymentRoutingRecordMock.mockReset();
    syncStripeSettlementForPaymentMock.mockReset();
    reconcilePaymentPayoutExecutionsMock.mockReset();
    getStripeConnectClientMock.mockReset();
  });

  it("attaches canonical appointment, barber, shop, and service metadata to Stripe payment intents", async () => {
    const stripeCreateMock = vi.fn().mockResolvedValue({
      id: "pi_live_1",
      status: "succeeded"
    });
    getStripeConnectClientMock.mockReturnValue({
      paymentIntents: {
        create: stripeCreateMock
      }
    });

    const supabase = createSupabaseStub();

    await createCapturedStripePaymentRecord(supabase as never, {
      appointmentId: "appt-live-1",
      clientId: "client-live-1",
      shopId: "shop-live-1",
      barberId: "barber-live-1",
      serviceId: "service-live-1",
      amount: 55,
      paymentType: "booking",
      paymentMethodId: "pm-local-1",
      metadata: {
        source: "booking_engine"
      },
      createdAt: "2026-04-21T12:30:00.000Z"
    });

    expect(stripeCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          appointment_id: "appt-live-1",
          barber_id: "barber-live-1",
          shop_id: "shop-live-1",
          service_id: "service-live-1"
        })
      }),
      undefined
    );
    expect(syncPaymentRoutingRecordMock).toHaveBeenCalledWith(expect.anything(), "pay-live-1");
  });
});
