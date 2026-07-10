import { NextResponse } from "next/server";
import { isPlatformAdminUser } from "@/lib/auth/demo-auth";
import { getSessionUser } from "@/lib/booking/route-auth";
import { buildReleaseReadinessSummary } from "@/lib/release/readiness";
import { buildV1CertificationSummary } from "@/lib/release/v1-certification";

export async function GET() {
  const user = await getSessionUser();
  if (!isPlatformAdminUser(user)) {
    return NextResponse.json(
      { error: "Only protected Architect access can read release certification." },
      { status: 403 }
    );
  }

  return NextResponse.json({
    certification: buildV1CertificationSummary(),
    supportingReadiness: buildReleaseReadinessSummary()
  });
}
