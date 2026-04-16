import { NextResponse } from "next/server";
import { requireArchitectAdmin } from "@/app/api/architect/verifications/_shared";
import { createEmptyArchitectVerificationDetailPayload, getVerificationProfileDetail } from "@/lib/platform-admin/verification-service";

export async function GET(_request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  try {
    const access = await requireArchitectAdmin();
    if (!access.ok) {
      return access.response;
    }

    const { profileId } = await params;
    const payload = await getVerificationProfileDetail(access.user, profileId);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[Architect Verification] detail route failed", error);
    return NextResponse.json(createEmptyArchitectVerificationDetailPayload(["Verification review data is partially unavailable. Core architect access is still active."]));
  }
}
