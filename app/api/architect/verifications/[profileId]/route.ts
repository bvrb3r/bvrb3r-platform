import { NextResponse } from "next/server";
import { isPlatformAdminUser } from "@/lib/auth/demo-auth";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { createEmptyArchitectVerificationDetailPayload, getVerificationProfileDetail } from "@/lib/platform-admin/verification-service";

export async function GET(_request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  try {
    const { user } = await getCurrentUserFromServer();
    if (user.accountStatus && user.accountStatus !== "active") {
      return NextResponse.json({ error: "Account access is disabled." }, { status: 403 });
    }

    if (!isPlatformAdminUser(user)) {
      return NextResponse.json({ error: "Architect verification access is restricted to the platform admin." }, { status: 403 });
    }

    const { profileId } = await params;
    const payload = await getVerificationProfileDetail(user, profileId);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[Architect Verification] detail route failed", error);
    return NextResponse.json(createEmptyArchitectVerificationDetailPayload(["Verification review data is partially unavailable. Core architect access is still active."]));
  }
}
