import { NextResponse } from "next/server";
import { z } from "zod";
import { createKioskBooking, KioskServiceError } from "@/lib/kiosk/service";

const kioskBookingSchema = z.object({
  fullName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  publicUsername: z.string().trim().optional(),
  selectedProfileId: z.string().trim().optional(),
  serviceId: z.string().trim().min(1),
  preferredBarberId: z.string().trim().optional(),
  kioskAction: z.enum(["book_next_opening", "schedule_ahead"]).optional(),
  scheduledAt: z.string().trim().optional(),
  paymentIntention: z.enum(["card_after_service", "cash_after_service", "saved_card", "prepay"]).optional(),
  transactionalSmsConsent: z.boolean().optional(),
  transactionalEmailConsent: z.boolean().optional(),
  marketingConsent: z.boolean().optional(),
  termsVersion: z.string().trim().optional(),
  privacyVersion: z.string().trim().optional(),
  shopPolicyVersion: z.string().trim().optional(),
  idempotencyKey: z.string().trim().min(12).max(200).optional()
}).superRefine((payload, context) => {
  if (payload.selectedProfileId) return;
  if (!payload.fullName?.trim() || payload.fullName.trim().length < 2) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["fullName"], message: "Full name is required." });
  }
  if (!payload.phone?.trim() || payload.phone.replace(/\D/g, "").length < 7) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message: "Phone is required." });
  }
  if (!payload.email?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["email"], message: "Email is required." });
  }
});

function toErrorResponse(error: unknown, fallback: string) {
  if (error instanceof KioskServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 });
}

export async function POST(request: Request, { params }: { params: Promise<{ shopId: string }> }) {
  try {
    const { shopId } = await params;
    const parsed = kioskBookingSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid kiosk booking payload.", code: "invalid_kiosk_booking_payload" }, { status: 400 });
    }
    const result = await createKioskBooking({
      shopId,
      ...parsed.data,
      email: parsed.data.email || undefined
    });
    return NextResponse.json({
      ...result,
      source: "shop_kiosk",
      paymentOwner: "bvrb3r"
    }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "Unable to create the kiosk booking.");
  }
}
