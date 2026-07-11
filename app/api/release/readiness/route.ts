import { NextResponse } from "next/server";
import { isPlatformAdminUser } from "@/lib/auth/demo-auth";
import { getSessionUser } from "@/lib/booking/route-auth";
import { buildReleaseReadinessSummary } from "@/lib/release/readiness";
import { buildMoneyTruthCertificationGate } from "@/lib/release/money-readiness.server";
import { buildV1CertificationSummary } from "@/lib/release/v1-certification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!isPlatformAdminUser(user)) {
    return NextResponse.json(
      { error: "Only protected Architect access can read release certification." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const moneyGate = await buildMoneyTruthCertificationGate();
  return NextResponse.json({
    certification: buildV1CertificationSummary({ [moneyGate.id]: moneyGate }),
    supportingReadiness: buildReleaseReadinessSummary()
  }, {
    headers: { "Cache-Control": "no-store" }
  });
}
