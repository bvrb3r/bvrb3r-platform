import { describe, expect, it, vi } from "vitest";
import { PaymentServiceError, readClientPaymentMethodsByClientId } from "@/lib/payments/service";

type QueryResult = {
  data: unknown;
  error: {
    code?: string | null;
    message?: string | null;
    details?: string | null;
    hint?: string | null;
  } | null;
};

function createSupabaseStub({
  clientLookupResult,
  paymentMethodsResult
}: {
  clientLookupResult?: QueryResult;
  paymentMethodsResult?: QueryResult;
}) {
  return {
    from(table: string) {
      if (table === "clients") {
        return {
          select(columns: string) {
            expect(columns).toBe("id");

            return {
              eq(column: string, value: string) {
                expect(column).toBe("reference_code");
                expect(value).toBe("client-jordan");

                return {
                  maybeSingle() {
                    return Promise.resolve(clientLookupResult ?? { data: null, error: null });
                  }
                };
              }
            };
          }
        };
      }

      if (table === "payment_methods") {
        return {
          select(columns: string) {
            expect(columns).toContain("client_id");
            expect(columns).toContain("provider_payment_method_id");

            return {
              eq(column: string, value: string) {
                expect(column).toBe("client_id");
                expect(value).toBe("11111111-1111-4111-8111-111111111111");

                return {
                  order(firstColumn: string, firstOptions: { ascending: boolean }) {
                    expect(firstColumn).toBe("is_default");
                    expect(firstOptions).toEqual({ ascending: false });

                    return {
                      order(secondColumn: string, secondOptions: { ascending: boolean }) {
                        expect(secondColumn).toBe("created_at");
                        expect(secondOptions).toEqual({ ascending: true });
                        return Promise.resolve(paymentMethodsResult ?? { data: [], error: null });
                      }
                    };
                  }
                };
              }
            };
          }
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }
  };
}

describe("payment methods service", () => {
  it("returns an empty list when a canonical client has no saved payment methods", async () => {
    const supabase = {
      from(table: string) {
        expect(table).toBe("payment_methods");

        return {
          select(columns: string) {
            expect(columns).toContain("client_id");

            return {
              eq(column: string, value: string) {
                expect(column).toBe("client_id");
                expect(value).toBe("11111111-1111-4111-8111-111111111111");

                return {
                  order() {
                    return {
                      order() {
                        return Promise.resolve({ data: [], error: null });
                      }
                    };
                  }
                };
              }
            };
          }
        };
      }
    };

    await expect(
      readClientPaymentMethodsByClientId("11111111-1111-4111-8111-111111111111", supabase as never)
    ).resolves.toEqual([]);
  });

  it("resolves a client reference code before querying payment methods", async () => {
    const supabase = createSupabaseStub({
      clientLookupResult: {
        data: { id: "11111111-1111-4111-8111-111111111111" },
        error: null
      },
      paymentMethodsResult: {
        data: [],
        error: null
      }
    });

    await expect(readClientPaymentMethodsByClientId("client-jordan", supabase as never)).resolves.toEqual([]);
  });

  it("returns an empty list when a client reference cannot be resolved to a canonical client row", async () => {
    const supabase = createSupabaseStub({
      clientLookupResult: {
        data: null,
        error: null
      }
    });

    await expect(readClientPaymentMethodsByClientId("client-jordan", supabase as never)).resolves.toEqual([]);
  });

  it("treats expected no-row responses as an empty payment method list", async () => {
    const supabase = createSupabaseStub({
      clientLookupResult: {
        data: { id: "11111111-1111-4111-8111-111111111111" },
        error: null
      },
      paymentMethodsResult: {
        data: null,
        error: {
          code: "PGRST116",
          message: "The result contains 0 rows",
          details: null
        }
      }
    });

    await expect(readClientPaymentMethodsByClientId("client-jordan", supabase as never)).resolves.toEqual([]);
  });

  it("still throws for real payment method query failures", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = createSupabaseStub({
      clientLookupResult: {
        data: { id: "11111111-1111-4111-8111-111111111111" },
        error: null
      },
      paymentMethodsResult: {
        data: null,
        error: {
          code: "42P01",
          message: "relation \"payment_methods\" does not exist",
          details: null
        }
      }
    });

    await expect(readClientPaymentMethodsByClientId("client-jordan", supabase as never)).rejects.toBeInstanceOf(PaymentServiceError);

    consoleErrorSpy.mockRestore();
  });
});
