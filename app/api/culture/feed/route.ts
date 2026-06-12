import { NextRequest, NextResponse } from "next/server";
import { listCultureFeed, type CultureSurfaceRole } from "@/lib/culture/service";

function parseRole(value: string | null): CultureSurfaceRole {
  if (value === "barber" || value === "owner" || value === "shop") {
    return value;
  }

  return "client";
}

function parseLimit(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const role = parseRole(request.nextUrl.searchParams.get("role"));
    const cursor = request.nextUrl.searchParams.get("cursor");
    const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
    const feed = await listCultureFeed({ role, cursor, limit });

    return NextResponse.json({ ok: true, ...feed });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to load Culture feed."
    }, { status: 500 });
  }
}
