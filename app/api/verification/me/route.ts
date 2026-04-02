import { NextResponse } from "next/server";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { createEmptyVerificationMePayload, getVerificationMePayload } from "@/lib/trust/verification-service";

export async function GET() {
  try {
    const { user } = await getCurrentUserFromServer();
    if (user.accountStatus && user.accountStatus !== "active") {
      return NextResponse.json({ error: "Account access is disabled." }, { status: 403 });
    }

    const payload = await getVerificationMePayload(user);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[Verification] me route failed", error);
    return NextResponse.json(
      createEmptyVerificationMePayload(["Verification data is partially unavailable. Core access is still active."])
    );
  }
}
