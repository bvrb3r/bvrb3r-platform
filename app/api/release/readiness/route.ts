import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { buildReleaseReadinessSummary } from "@/lib/release/readiness";

export async function GET() {
  const user = await getSessionUser();
  if (!(user.role === "owner" || user.role === "manager")) {
    return NextResponse.json({ error: "Only owner and manager roles can read release readiness." }, { status: 403 });
  }

  return NextResponse.json({ readiness: buildReleaseReadinessSummary() });
}
