import { NextResponse } from "next/server";
import { reactivateVerificationProfile } from "@/lib/platform-admin/verification-service";
import { architectVerificationActionSchema, requireArchitectAdmin } from "@/app/api/architect/verifications/_shared";

export async function POST(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const access = await requireArchitectAdmin();
  if (!access.ok) {
    return access.response;
  }

  const parsed = architectVerificationActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid verification reactivation payload." }, { status: 400 });
  }

  try {
    const { profileId } = await params;
    const result = await reactivateVerificationProfile(access.user, profileId, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to reactivate this verification profile." }, { status: 500 });
  }
}
