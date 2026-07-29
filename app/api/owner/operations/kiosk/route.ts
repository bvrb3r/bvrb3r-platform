import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import {
  OwnerOperationsServiceError,
  pairOwnerKioskDevice,
  updateOwnerKioskPolicy,
  setOwnerKioskEmergencyState
} from "@/lib/owner-operations/service";

const emergencySchema = z.object({
  shopId: z.string().trim().min(1),
  action: z.literal("emergency").optional(),
  disabled: z.boolean(),
  reason: z.string().trim().min(3).max(500)
}).strict();

const policySchema = z.object({
  shopId: z.string().trim().min(1),
  action: z.literal("policy"),
  privacyMode: z.boolean().optional(),
  autoResetEnabled: z.boolean().optional(),
  externalCheckinEnabled: z.boolean().optional(),
  guestCheckinAllowed: z.boolean().optional(),
  clientBridgePromptEnabled: z.boolean().optional(),
  clientBridgePromptFrequency: z.enum(["once_per_visit", "once_per_30_days", "never"]).optional(),
  qrEntryEnabled: z.boolean().optional(),
  nfcEntryEnabled: z.boolean().optional(),
  notificationFailureEscalation: z.boolean().optional(),
  rotationPolicy: z.enum(["strict", "balanced", "fastest_available"]).optional(),
  balanceGuardrailMinutes: z.number().int().min(0).max(180).optional(),
  paymentCollectionPolicy: z.enum(["barber_checkout", "prepay"]).optional(),
  sessionTimeoutSeconds: z.number().int().min(60).max(90).optional(),
  reason: z.string().trim().min(3).max(500)
}).strict().refine(
  (value) => Object.keys(value).some((key) => !["shopId", "action", "reason"].includes(key)),
  "At least one kiosk policy is required."
);

const pairSchema = z.object({
  shopId: z.string().trim().min(1),
  reason: z.string().trim().min(3).max(500)
}).strict();

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const policy = policySchema.safeParse(body);
    if (policy.success) {
      return NextResponse.json(
        await updateOwnerKioskPolicy(await getSessionUser(), policy.data)
      );
    }
    const emergency = emergencySchema.safeParse(body);
    if (!emergency.success) {
      return NextResponse.json({ error: "Invalid kiosk emergency change." }, { status: 400 });
    }
    return NextResponse.json(
      await setOwnerKioskEmergencyState(await getSessionUser(), emergency.data)
    );
  } catch (error) {
    if (error instanceof OwnerOperationsServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to change kiosk emergency state." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const parsed = pairSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid kiosk pairing request." }, { status: 400 });
    }
    return NextResponse.json(
      await pairOwnerKioskDevice(await getSessionUser(), parsed.data)
    );
  } catch (error) {
    if (error instanceof OwnerOperationsServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to pair this kiosk device." }, { status: 500 });
  }
}
