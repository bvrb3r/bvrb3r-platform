import { z } from "zod";

export const GIFT_CARD_PRESET_CENTS = [2500, 5000, 7500, 10_000] as const;
export const GIFT_CARD_MIN_CENTS = 1000;
export const GIFT_CARD_MAX_CENTS = 50_000;

export const giftCardScopeTypes = ["platform", "barber", "shop"] as const;
export type GiftCardScopeType = (typeof giftCardScopeTypes)[number];

export const giftCardPurchaseSchema = z.object({
  amountCents: z.number().int().min(GIFT_CARD_MIN_CENTS).max(GIFT_CARD_MAX_CENTS),
  scopeType: z.enum(giftCardScopeTypes),
  scopeId: z.string().uuid().nullable().optional(),
  senderName: z.string().trim().min(2).max(120),
  recipientName: z.string().trim().min(2).max(120),
  deliveryChannel: z.enum(["email", "sms"]),
  recipientEmail: z.string().trim().email().max(200).nullable().optional(),
  recipientPhone: z.string().trim().min(7).max(40).nullable().optional(),
  message: z.string().trim().max(280).default(""),
  idempotencyKey: z.string().trim().min(8).max(200)
}).superRefine((value, context) => {
  if (value.scopeType === "platform" && value.scopeId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["scopeId"], message: "Platform cards do not take a scope id." });
  }
  if (value.scopeType !== "platform" && !value.scopeId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["scopeId"], message: "This card scope needs a verified destination." });
  }
  if (value.deliveryChannel === "email" && !value.recipientEmail) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["recipientEmail"], message: "An email destination is required." });
  }
  if (value.deliveryChannel === "sms" && !value.recipientPhone) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["recipientPhone"], message: "A phone destination is required." });
  }
});

export type GiftCardPurchaseInput = z.infer<typeof giftCardPurchaseSchema>;

export const giftCardConfirmSchema = z.object({
  purchaseId: z.string().uuid(),
  purchaseToken: z.string().min(32).max(200),
  claimToken: z.string().min(32).max(200)
});

export const giftCardClaimSchema = z.object({
  claimToken: z.string().min(32).max(200)
});

export const giftCardRedeemSchema = z.object({
  appointmentId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(200)
});

export type GiftCardScope = {
  scopeType: GiftCardScopeType;
  barberId: string | null;
  shopId: string | null;
};

export function giftCardScopeAllows(
  scope: GiftCardScope,
  appointment: { barberId: string; shopId: string }
) {
  if (scope.scopeType === "platform") return true;
  if (scope.scopeType === "barber") return scope.barberId === appointment.barberId;
  return scope.shopId === appointment.shopId;
}

/**
 * Gift cards are tender for the service line only. The tip is deliberately not
 * an input to this calculation, so it cannot be consumed by the card.
 */
export function computeGiftCardApplication(input: {
  availableCents: number;
  serviceCents: number;
  alreadyAppliedCents: number;
  serviceBalanceDueCents: number;
}) {
  const remainingService = Math.max(0, input.serviceCents - input.alreadyAppliedCents);
  return Math.max(0, Math.min(
    Math.floor(input.availableCents),
    Math.floor(remainingService),
    Math.floor(input.serviceBalanceDueCents)
  ));
}

export function giftCardRules() {
  return {
    expires: false,
    coversTips: false,
    barberReceivesFullServicePrice: true,
    partialBalanceCarriesForward: true
  } as const;
}
