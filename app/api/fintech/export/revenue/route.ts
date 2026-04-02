import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { readRevenueExport } from "@/lib/fintech/exports";

function readYear(request: NextRequest) {
  const year = Number(request.nextUrl.searchParams.get("year") ?? new Date().getUTCFullYear());
  return Number.isFinite(year) && year >= 2020 && year <= 2100
    ? Math.trunc(year)
    : new Date().getUTCFullYear();
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!(user.role === "owner" || user.role === "manager")) {
    return NextResponse.json({ error: "Only owners or managers can view revenue exports." }, { status: 403 });
  }

  try {
    const exportData = await readRevenueExport({
      user,
      year: readYear(request)
    });
    return NextResponse.json({ export: exportData });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to build the revenue export.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
