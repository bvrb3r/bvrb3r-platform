import { NextResponse } from "next/server";
import { suspendVerificationProfile } from "@/lib/platform-admin/verification-service";
import { architectVerificationActionSchema, requireArchitectAdmin } from "@/app/api/architect/verifications/_shared";

export async function POST(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const access = await requireArchitectAdmin();
  if (!access.ok) {
    return access.response;
  }

  const parsed = architectVerificationActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid verification suspension payload." }, { status: 400 });
  }

  try {
    const { profileId } = await params;
    const result = await suspendVerificationProfile(access.user, profileId, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to suspend this verification profile." }, { status: 500 });
  }
}
