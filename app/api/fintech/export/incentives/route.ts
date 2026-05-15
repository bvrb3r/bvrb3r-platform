import { NextRequest, NextResponse } from "next/server";
import { isBarberAccountRole } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/booking/route-auth";
import { readIncentivesExport } from "@/lib/fintech/exports";

function readYear(request: NextRequest) {
  const year = Number(request.nextUrl.searchParams.get("year") ?? new Date().getUTCFullYear());
  return Number.isFinite(year) && year >= 2020 && year <= 2100
    ? Math.trunc(year)
    : new Date().getUTCFullYear();
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!(user.role === "owner" || user.role === "manager" || isBarberAccountRole(user.role))) {
    return NextResponse.json({ error: "Only owner, manager, or barber roles can view incentive exports." }, { status: 403 });
  }

  try {
    const exportData = await readIncentivesExport({
      user,
      year: readYear(request)
    });
    return NextResponse.json({ export: exportData });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to build the incentives export.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
