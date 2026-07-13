import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { claimClientBridgeInvitation, PriorityOneKioskError, readClientBridgeInvitation } from "@/lib/kiosk/priority1-service";

const activationSchema = z.object({
  verificationMethod: z.enum(["sms", "email"]),
  verificationCode: z.string().trim().optional(),
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9._]+$/).optional(),
  favoriteBarber: z.boolean().optional(),
  followShop: z.boolean().optional(),
  transactionalSmsConsent: z.boolean().optional(),
  transactionalEmailConsent: z.boolean().optional(),
  marketingConsent: z.boolean().optional(),
  termsAccepted: z.literal(true),
  privacyAccepted: z.literal(true)
});

function errorResponse(error: unknown) {
  if (error instanceof PriorityOneKioskError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to activate this BVRB3R account." }, { status: 500 });
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    return NextResponse.json(await readClientBridgeInvitation(token));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const parsed = activationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Complete the required activation choices.", code: "invalid_client_bridge_activation" }, { status: 400 });
    }
    const session = await getCurrentUserFromServer();
    if (!session.authenticated || session.user.id === "guest-user") {
      return NextResponse.json({
        error: "Sign in or create your BVRB3R Client account before claiming this invitation.",
        code: "client_authentication_required",
        signInPath: `/login?redirect=${encodeURIComponent(`/join/${token}`)}`
      }, { status: 401 });
    }
    if (session.user.role !== "client_user") {
      return NextResponse.json({ error: "Switch to your Client lane before claiming this visit.", code: "client_role_required" }, { status: 403 });
    }
    return NextResponse.json(await claimClientBridgeInvitation(token, session.user.id, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
