import type {
  PromotionAppliesToScope,
  PromotionDiscountType,
  PromotionRedemptionStatus,
  PromotionType
} from "@/types/domain";

export type PromotionAvailabilityState = "active" | "scheduled" | "expired" | "inactive";

export type PromotionRuleShape = {
  id?: string;
  shopId: string;
  name: string;
  code?: string | null;
  description?: string | null;
  promotionType: PromotionType;
  discountType: PromotionDiscountType;
  discountValue: number;
  appliesToScope: PromotionAppliesToScope;
  serviceId?: string | null;
  barberId?: string | null;
  minSubtotal?: number | null;
  maxDiscountAmount?: number | null;
  usageLimit?: number | null;
  usageCount?: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

export type PromotionCreateInput = {
  shopId: string;
  name: string;
  code?: string;
  description?: string;
  promotionType: PromotionType;
  discountType: PromotionDiscountType;
  discountValue: number;
  appliesToScope: PromotionAppliesToScope;
  serviceId?: string;
  barberId?: string;
  minSubtotal?: number;
  maxDiscountAmount?: number;
  usageLimit?: number;
  startsAt: string;
  endsAt: string;
  isActive?: boolean;
};

export type PromotionUpdateInput = Partial<PromotionCreateInput> & {
  isActive?: boolean;
};

export type PromotionEligibilityContext = {
  shopId: string;
  serviceId?: string;
  barberId?: string;
  subtotal: number;
  serviceBaseAmount?: number;
  nowIso?: string;
};

export type PromotionEvaluationResult =
  | { ok: true; discountAmount: number }
  | { ok: false; reason: string };

const redemptionTransitionMap: Record<PromotionRedemptionStatus, PromotionRedemptionStatus[]> = {
  reserved: ["applied", "voided"],
  applied: ["completed", "voided"],
  completed: [],
  voided: []
};

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export function normalizePromotionCode(value?: string | null) {
  const normalized = value?.trim().toUpperCase();
  return normalized ? normalized : undefined;
}

function parseIsoOrThrow(value: string, label: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid date.`);
  }
  return date;
}

export function normalizePromotionInput<T extends PromotionCreateInput | PromotionUpdateInput>(
  input: T,
  mode: "create" | "update"
) {
  const normalizedCode = input.code === undefined ? undefined : normalizePromotionCode(input.code ?? null) ?? "";
  const normalizedName = input.name?.trim();
  const normalizedDescription = input.description?.trim() || undefined;
  const discountValue = input.discountValue === undefined ? undefined : roundCurrency(Number(input.discountValue));
  const minSubtotal = input.minSubtotal === undefined ? undefined : roundCurrency(Number(input.minSubtotal));
  const maxDiscountAmount = input.maxDiscountAmount === undefined ? undefined : roundCurrency(Number(input.maxDiscountAmount));
  const usageLimit = input.usageLimit === undefined ? undefined : Math.trunc(Number(input.usageLimit));

  if (mode === "create") {
    const startsAtValue = input.startsAt;
    const endsAtValue = input.endsAt;
    if (!normalizedName || normalizedName.length < 2) {
      throw new Error("Promotion name must be at least 2 characters.");
    }
    if (!input.shopId?.trim()) {
      throw new Error("A valid shop is required for the promotion.");
    }
    if (!input.promotionType) {
      throw new Error("Promotion type is required.");
    }
    if (!input.discountType) {
      throw new Error("Discount type is required.");
    }
    if (!input.appliesToScope) {
      throw new Error("Promotion scope is required.");
    }
    if (discountValue === undefined || Number.isNaN(discountValue) || discountValue <= 0) {
      throw new Error("Discount value must be greater than 0.");
    }
    if (!startsAtValue || !endsAtValue) {
      throw new Error("Promotion start and end are required.");
    }
    const startsAt = parseIsoOrThrow(startsAtValue, "Promotion start");
    const endsAt = parseIsoOrThrow(endsAtValue, "Promotion end");
    if (endsAt.getTime() < startsAt.getTime()) {
      throw new Error("Promotion end must be after the start.");
    }
  }

  if (normalizedCode !== undefined && normalizedCode === "") {
    throw new Error("Promotion code cannot be blank.");
  }
  if (input.promotionType === "code" && mode === "create" && !normalizedCode) {
    throw new Error("Code-based promotions require a code.");
  }
  if (discountValue !== undefined && discountValue <= 0) {
    throw new Error("Discount value must be greater than 0.");
  }
  if (input.discountType === "percent" && discountValue !== undefined && discountValue > 100) {
    throw new Error("Percent discounts cannot exceed 100%.");
  }
  if (input.appliesToScope === "service" && !(input.serviceId?.trim())) {
    throw new Error("Service-scoped promotions require a valid service.");
  }
  if (minSubtotal !== undefined && minSubtotal < 0) {
    throw new Error("Minimum subtotal cannot be negative.");
  }
  if (maxDiscountAmount !== undefined && maxDiscountAmount < 0) {
    throw new Error("Maximum discount cannot be negative.");
  }
  if (usageLimit !== undefined && usageLimit < 1) {
    throw new Error("Usage limit must be at least 1.");
  }
  if (input.startsAt !== undefined && input.endsAt !== undefined) {
    const startsAt = parseIsoOrThrow(input.startsAt, "Promotion start");
    const endsAt = parseIsoOrThrow(input.endsAt, "Promotion end");
    if (endsAt.getTime() < startsAt.getTime()) {
      throw new Error("Promotion end must be after the start.");
    }
  }

  return {
    shopId: input.shopId?.trim(),
    name: normalizedName,
    code: normalizedCode,
    description: normalizedDescription,
    promotionType: input.promotionType,
    discountType: input.discountType,
    discountValue,
    appliesToScope: input.appliesToScope,
    serviceId: input.serviceId?.trim() || undefined,
    barberId: input.barberId?.trim() || undefined,
    minSubtotal,
    maxDiscountAmount,
    usageLimit,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    isActive: input.isActive
  };
}

export function getPromotionAvailabilityState(
  promotion: Pick<PromotionRuleShape, "startsAt" | "endsAt" | "isActive">,
  nowIso = new Date().toISOString()
): PromotionAvailabilityState {
  if (!promotion.isActive) {
    return "inactive";
  }

  const now = new Date(nowIso).getTime();
  const startsAt = new Date(promotion.startsAt).getTime();
  const endsAt = new Date(promotion.endsAt).getTime();

  if (Number.isNaN(startsAt) || Number.isNaN(endsAt)) {
    return "inactive";
  }

  if (now < startsAt) {
    return "scheduled";
  }

  if (now > endsAt) {
    return "expired";
  }

  return "active";
}

export function evaluatePromotionDiscount(
  promotion: PromotionRuleShape,
  context: PromotionEligibilityContext
): PromotionEvaluationResult {
  const availabilityState = getPromotionAvailabilityState(promotion, context.nowIso);
  if (availabilityState !== "active") {
    return { ok: false, reason: "This promotion is not active right now." };
  }

  if (promotion.shopId !== context.shopId) {
    return { ok: false, reason: "This promotion is not valid for the selected shop." };
  }

  if (promotion.serviceId && promotion.serviceId !== context.serviceId) {
    return { ok: false, reason: "This promotion does not apply to the selected service." };
  }

  if (promotion.barberId && promotion.barberId !== context.barberId) {
    return { ok: false, reason: "This promotion is not valid with the selected barber." };
  }

  if ((promotion.usageLimit ?? null) !== null && (promotion.usageCount ?? 0) >= (promotion.usageLimit ?? 0)) {
    return { ok: false, reason: "This promotion has reached its usage limit." };
  }

  if ((promotion.minSubtotal ?? 0) > context.subtotal) {
    return { ok: false, reason: "This promotion requires a higher booking subtotal." };
  }

  const scopedAmount =
    promotion.appliesToScope === "service"
      ? Math.max(context.serviceBaseAmount ?? 0, 0)
      : Math.max(context.subtotal, 0);

  if (scopedAmount <= 0) {
    return { ok: false, reason: "This promotion needs a valid booking subtotal." };
  }

  let discountAmount =
    promotion.discountType === "percent"
      ? scopedAmount * (promotion.discountValue / 100)
      : promotion.discountValue;

  if ((promotion.maxDiscountAmount ?? null) !== null) {
    discountAmount = Math.min(discountAmount, promotion.maxDiscountAmount ?? discountAmount);
  }

  discountAmount = Math.min(roundCurrency(discountAmount), roundCurrency(context.subtotal));

  if (discountAmount <= 0) {
    return { ok: false, reason: "This promotion does not reduce the current booking total." };
  }

  return { ok: true, discountAmount };
}

export function assertPromotionRedemptionTransition(
  currentStatus: PromotionRedemptionStatus,
  nextStatus: PromotionRedemptionStatus
) {
  if (!(redemptionTransitionMap[currentStatus] ?? []).includes(nextStatus)) {
    throw new Error(`Cannot move promotion redemption from ${currentStatus} to ${nextStatus}.`);
  }
}
