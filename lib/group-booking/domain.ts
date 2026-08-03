import { z } from "zod";

export const GROUP_BOOKING_MIN_MEMBERS = 2;
export const GROUP_BOOKING_MAX_MEMBERS = 6;
export const GROUP_BOOKING_WINDOW_MINUTES = 30;

export const groupPaymentModes = ["organizer", "split"] as const;
export type GroupPaymentMode = (typeof groupPaymentModes)[number];

export const groupMemberInputSchema = z.object({
  memberKey: z.string().trim().min(1).max(80),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(7).max(40),
  isMinor: z.boolean().default(false),
  barberId: z.string().uuid(),
  serviceId: z.string().uuid(),
  locationId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true })
});

export const createGroupBookingSchema = z.object({
  organizer: z.object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().min(7).max(40)
  }),
  paymentMode: z.enum(groupPaymentModes),
  splitPaymentSmsConsent: z.boolean().default(false),
  members: z.array(groupMemberInputSchema)
    .min(GROUP_BOOKING_MIN_MEMBERS)
    .max(GROUP_BOOKING_MAX_MEMBERS),
  idempotencyKey: z.string().trim().min(8).max(200)
}).superRefine((value, context) => {
  if (value.paymentMode === "split" && !value.splitPaymentSmsConsent) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["splitPaymentSmsConsent"],
      message: "Consent to transactional payment-link texts is required when everyone pays their own service."
    });
  }
  if (value.members[0]?.isMinor) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["members", 0, "isMinor"],
      message: "The organizer cannot be marked as a minor."
    });
  }
  const keys = new Set(value.members.map((member) => member.memberKey));
  if (keys.size !== value.members.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["members"],
      message: "Every group member needs a distinct member key."
    });
  }

  const locations = new Set(value.members.map((member) => member.locationId));
  if (locations.size !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["members"],
      message: "A group booking must use one shop location."
    });
  }

  const times = value.members.map((member) => new Date(member.startsAt).getTime());
  const windowMinutes = (Math.max(...times) - Math.min(...times)) / 60_000;
  if (windowMinutes > GROUP_BOOKING_WINDOW_MINUTES) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["members"],
      message: `All chairs must begin inside one ${GROUP_BOOKING_WINDOW_MINUTES}-minute window.`
    });
  }
});

export type CreateGroupBookingInput = z.infer<typeof createGroupBookingSchema>;
export type GroupMemberInput = z.infer<typeof groupMemberInputSchema>;

export type TrustedGroupHold = {
  memberId: string;
  memberKey: string;
  holdId: string;
  fullName: string;
  email: string;
  isMinor: boolean;
  barberId: string;
  serviceId: string;
  locationId: string;
  startsAt: string;
  endsAt: string;
  priceCents: number;
  currency: string;
};

export type GroupPaymentResponsibility = {
  memberId: string;
  payerKind: "organizer" | "member";
  payerEmail: string;
  amountCents: number;
  currency: string;
};

/**
 * Builds responsibility from server-owned hold prices. A browser may choose
 * who pays, but it can never propose the amount assigned to that payer.
 */
export function buildGroupPaymentResponsibilities(
  holds: TrustedGroupHold[],
  paymentMode: GroupPaymentMode,
  organizerEmail: string
): GroupPaymentResponsibility[] {
  return holds.map((hold) => {
    const memberPays = paymentMode === "split" && !hold.isMinor;
    return {
      memberId: hold.memberId,
      payerKind: memberPays ? "member" : "organizer",
      payerEmail: memberPays
        ? hold.email.toLowerCase()
        : organizerEmail.toLowerCase(),
      amountCents: hold.priceCents,
      currency: hold.currency.toLowerCase()
    };
  });
}

export function groupBookingWindow(holds: Pick<TrustedGroupHold, "startsAt" | "endsAt">[]) {
  if (!holds.length) return null;
  return {
    startsAt: [...holds].sort((left, right) => left.startsAt.localeCompare(right.startsAt))[0].startsAt,
    endsAt: [...holds].sort((left, right) => right.endsAt.localeCompare(left.endsAt))[0].endsAt
  };
}

export const kioskGroupRequestSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(40),
  email: z.string().trim().email().max(200).optional(),
  groupSize: z.number().int().min(GROUP_BOOKING_MIN_MEMBERS).max(GROUP_BOOKING_MAX_MEMBERS),
  seatingMode: z.enum(["together", "fastest"]),
  operationalSmsConsent: z.boolean().default(false),
  idempotencyKey: z.string().trim().min(8).max(200)
});

export type KioskGroupRequestInput = z.infer<typeof kioskGroupRequestSchema>;

export function kioskGroupHonesty(input: Pick<KioskGroupRequestInput, "groupSize" | "seatingMode">) {
  if (input.seatingMode === "together") {
    return {
      status: "waiting_for_group_capacity" as const,
      message: `${input.groupSize} places are requested together. A wait time appears only after the live floor confirms enough chairs.`
    };
  }

  return {
    status: "waiting_for_individual_capacity" as const,
    message: `${input.groupSize} places may be seated separately as live chairs become available.`
  };
}
