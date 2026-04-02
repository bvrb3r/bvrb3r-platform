import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { readFinancialAnomalyQueue } from "@/lib/fintech/anomalies";

export async function GET() {
  const user = await getSessionUser();
  if (!(user.role === "owner" || user.role === "manager")) {
    return NextResponse.json({ error: "Only owners or managers can view financial anomalies." }, { status: 403 });
  }

  try {
    const anomalies = await readFinancialAnomalyQueue({
      locationIds: user.locationIds
    });
    return NextResponse.json({ anomalies });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load financial anomalies.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
