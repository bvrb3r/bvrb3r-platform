import { NextResponse } from "next/server";
import {
  claimClientBridgeHistory,
  ClientBridgeServiceError,
  declineClientBridgeInvitation,
  getClientBridgeClaim
} from "@/lib/clientbridge/service";
import { getCurrentUserFromServer } from "@/lib/auth/session";

function errorResponse(error: unknown) {
  if (error instanceof ClientBridgeServiceError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return NextResponse.json({ error: "Unable to process this activation link." }, { status: 500 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const claim = await getClientBridgeClaim(token);
    if (!claim) {
      return NextResponse.json({ error: "Activation link not found." }, { status: 404 });
    }
    return NextResponse.json(claim, {
      headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const session = await getCurrentUserFromServer();
    if (!session.authenticated || session.user.id === "guest-user") {
      return NextResponse.json(
        { error: "Sign in or create your client account on this phone, then use the link again." },
        { status: 401 }
      );
    }
    const { token } = await context.params;
    return NextResponse.json(await claimClientBridgeHistory(token, session.user));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    return NextResponse.json(await declineClientBridgeInvitation(token));
  } catch (error) {
    return errorResponse(error);
  }
}

