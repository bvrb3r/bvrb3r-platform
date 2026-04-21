import { describe, expect, it } from "vitest";
import { resolveOperationalPaymentRecordAttributes } from "@/lib/operations/live-provider";

describe("live operations payment stage mapping", () => {
  it("keeps checkout money in the booking ledger while preserving an explicit checkout stage", () => {
    expect(resolveOperationalPaymentRecordAttributes("checkout")).toEqual({
      paymentType: "booking",
      legacyType: "checkout",
      paymentStage: "checkout"
    });
  });

  it("uses the booking stage for appointment deposits and prepay captures", () => {
    expect(resolveOperationalPaymentRecordAttributes("booking")).toEqual({
      paymentType: "booking",
      legacyType: "booking",
      paymentStage: "booking"
    });
  });
});
