import { describe, expect, it } from "vitest";
import {
  buildGroupPaymentResponsibilities,
  createGroupBookingSchema,
  kioskGroupHonesty,
  type TrustedGroupHold
} from "@/lib/group-booking/domain";
import {
  computeGiftCardApplication,
  giftCardPurchaseSchema,
  giftCardRules,
  giftCardScopeAllows
} from "@/lib/gift-cards/domain";
import { deriveGiftCardClaimToken, hashGiftCardToken } from "@/lib/gift-cards/service";

const uuid = (suffix: number) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

function member(index: number, startsAt = "2026-08-08T15:00:00.000Z") {
  return {
    memberKey: `member-${index}`,
    fullName: `Member ${index}`,
    email: `member${index}@example.com`,
    phone: `+1813555000${index}`,
    isMinor: false,
    barberId: uuid(index),
    serviceId: uuid(index + 10),
    locationId: uuid(30),
    startsAt
  };
}

describe("Product PR36 group booking domain", () => {
  it("accepts two to six members in one shop and one thirty-minute window", () => {
    const parsed = createGroupBookingSchema.parse({
      organizer: { fullName: "Phil Rivera", email: "phil@example.com", phone: "+18135550000" },
      paymentMode: "split",
      splitPaymentSmsConsent: true,
      members: [member(1), member(2, "2026-08-08T15:30:00.000Z")],
      idempotencyKey: "group-test-1"
    });
    expect(parsed.members).toHaveLength(2);
    expect(parsed.paymentMode).toBe("split");
  });

  it("requires transactional text consent before split payment can be selected", () => {
    const payload = {
      organizer: { fullName: "Phil Rivera", email: "phil@example.com", phone: "+18135550000" },
      paymentMode: "split" as const,
      members: [member(1), member(2)],
      idempotencyKey: "group-test-consent"
    };
    expect(createGroupBookingSchema.safeParse(payload).success).toBe(false);
    expect(createGroupBookingSchema.safeParse({ ...payload, splitPaymentSmsConsent: true }).success).toBe(true);
  });

  it("refuses a group spread across shops or outside the group window", () => {
    const base = {
      organizer: { fullName: "Phil Rivera", email: "phil@example.com", phone: "+18135550000" },
      paymentMode: "organizer" as const,
      idempotencyKey: "group-test-2"
    };
    expect(createGroupBookingSchema.safeParse({
      ...base,
      members: [member(1), { ...member(2), locationId: uuid(31) }]
    }).success).toBe(false);
    expect(createGroupBookingSchema.safeParse({
      ...base,
      members: [member(1), member(2, "2026-08-08T15:31:00.000Z")]
    }).success).toBe(false);
  });

  it("takes payer amounts only from trusted hold snapshots and assigns minors to the organizer", () => {
    const holds: TrustedGroupHold[] = [
      {
        memberId: uuid(101), memberKey: "adult", holdId: uuid(201), fullName: "Adult", email: "adult@example.com",
        isMinor: false, barberId: uuid(1), serviceId: uuid(11), locationId: uuid(30),
        startsAt: "2026-08-08T15:00:00.000Z", endsAt: "2026-08-08T15:45:00.000Z",
        priceCents: 5500, currency: "usd"
      },
      {
        memberId: uuid(102), memberKey: "minor", holdId: uuid(202), fullName: "Minor", email: "organizer@example.com",
        isMinor: true, barberId: uuid(2), serviceId: uuid(12), locationId: uuid(30),
        startsAt: "2026-08-08T15:00:00.000Z", endsAt: "2026-08-08T15:30:00.000Z",
        priceCents: 2500, currency: "usd"
      }
    ];
    expect(buildGroupPaymentResponsibilities(holds, "split", "organizer@example.com")).toEqual([
      expect.objectContaining({ memberId: uuid(101), payerKind: "member", payerEmail: "adult@example.com", amountCents: 5500 }),
      expect.objectContaining({ memberId: uuid(102), payerKind: "organizer", payerEmail: "organizer@example.com", amountCents: 2500 })
    ]);
  });

  it("does not invent a kiosk wait time or queue position", () => {
    expect(kioskGroupHonesty({ groupSize: 4, seatingMode: "together" })).toEqual({
      status: "waiting_for_group_capacity",
      message: expect.stringContaining("live floor confirms")
    });
  });
});

describe("Product PR36 gift-card domain", () => {
  it("recovers the same opaque claim credential for browser and verified webhook paths", () => {
    const purchaseId = uuid(36);
    const secret = "pr36-gift-claim-test-secret-with-at-least-32-characters";
    const first = deriveGiftCardClaimToken(purchaseId, secret);
    const second = deriveGiftCardClaimToken(purchaseId, secret);
    expect(first).toBe(second);
    expect(first).not.toContain(purchaseId);
    expect(hashGiftCardToken(first)).toMatch(/^[0-9a-f]{64}$/);
    expect(() => deriveGiftCardClaimToken(purchaseId, "short")).toThrow(/not configured/i);
  });

  it("requires a verified id for barber and shop scoped cards", () => {
    const base = {
      amountCents: 5000,
      senderName: "Phil Rivera",
      recipientName: "Marcus Rivera",
      deliveryChannel: "email" as const,
      recipientEmail: "marcus@example.com",
      recipientPhone: null,
      message: "Happy birthday",
      idempotencyKey: "gift-test-1"
    };
    expect(giftCardPurchaseSchema.safeParse({ ...base, scopeType: "barber", scopeId: null }).success).toBe(false);
    expect(giftCardPurchaseSchema.safeParse({ ...base, scopeType: "platform", scopeId: null }).success).toBe(true);
  });

  it("caps redemption at remaining service value and never takes a tip input", () => {
    expect(computeGiftCardApplication({
      availableCents: 5000,
      serviceCents: 4000,
      alreadyAppliedCents: 1000,
      serviceBalanceDueCents: 3000
    })).toBe(3000);
    expect(Object.keys(computeGiftCardApplication)).not.toContain("tip");
  });

  it("enforces scope and the permanent doctrine locks", () => {
    expect(giftCardScopeAllows(
      { scopeType: "shop", barberId: null, shopId: uuid(30) },
      { barberId: uuid(1), shopId: uuid(30) }
    )).toBe(true);
    expect(giftCardScopeAllows(
      { scopeType: "barber", barberId: uuid(2), shopId: null },
      { barberId: uuid(1), shopId: uuid(30) }
    )).toBe(false);
    expect(giftCardRules()).toEqual({
      expires: false,
      coversTips: false,
      barberReceivesFullServicePrice: true,
      partialBalanceCarriesForward: true
    });
  });
});
