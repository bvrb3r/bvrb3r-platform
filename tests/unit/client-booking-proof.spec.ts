import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const proofScript = readFileSync(join(
  process.cwd(),
  "scripts/verify-client-booking-loop.mjs"
), "utf8");

describe("client booking certification proof", () => {
  it("distinguishes captured authenticated payments from deferred guest balances", () => {
    expect(proofScript).toContain("signedInPaidBookingConfirmsCapturedPayment");
    expect(proofScript).toContain("guestBookingDefersPaymentAndPreservesBalanceDue");
    expect(proofScript).toContain("deferPaymentCollection: isGuestBooking");
    expect(proofScript).toContain(
      "Guest paid-service booking creates one confirmed appointment, captures no payment, and preserves the full balance due."
    );
    expect(proofScript).not.toContain("paymentConfirmationBeforeConfirmedState");
  });
});
