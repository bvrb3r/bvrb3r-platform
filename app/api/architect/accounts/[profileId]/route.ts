import { NextRequest, NextResponse } from "next/server";
import { requireArchitectAdmin } from "@/app/api/architect/verifications/_shared";
import { getArchitectAccountDetailPayload } from "@/lib/platform-admin/accounts-service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ profileId: string }> }
) {
  try {
    const access = await requireArchitectAdmin();
    if (!access.ok) return access.response;

    const { profileId } = await params;
    const payload = await getArchitectAccountDetailPayload(access.user, profileId);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load Architect account detail." },
      { status: 500 }
    );
  }
}
