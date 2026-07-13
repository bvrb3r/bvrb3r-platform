import { NextResponse } from "next/server";
import { z } from "zod";
import { createClientBridgeInvitation, PriorityOneKioskError } from "@/lib/kiosk/priority1-service";

const invitationSchema = z.object({
  guestVisitId: z.string().uuid(),
  channel: z.enum(["onscreen", "sms", "email", "qr", "nfc", "barber_assisted"]),
  phone: z.string().trim().optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  consentGranted: z.boolean(),
  conversionTouchpoint: z.string().trim().min(2).max(80)
});

function errorResponse(error: unknown) {
  if (error instanceof PriorityOneKioskError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create the ClientBridge invitation." }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const parsed = invitationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "The ClientBridge invitation is incomplete.", code: "invalid_client_bridge_invitation" }, { status: 400 });
    }
    return NextResponse.json(await createClientBridgeInvitation({
      ...parsed.data,
      email: parsed.data.email || undefined
    }), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
