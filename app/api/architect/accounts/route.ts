import { NextRequest, NextResponse } from "next/server";
import { requireArchitectAdmin } from "@/app/api/architect/verifications/_shared";
import { getArchitectAccountDirectoryPayload, normalizeArchitectAccountDirectoryFilters } from "@/lib/platform-admin/accounts-service";
import type { ArchitectAccountDirectoryFilters } from "@/types/platform-admin";

export async function GET(request: NextRequest) {
  try {
    const access = await requireArchitectAdmin();
    if (!access.ok) return access.response;

    const { searchParams } = request.nextUrl;
    const filters: ArchitectAccountDirectoryFilters = normalizeArchitectAccountDirectoryFilters({
      search: searchParams.get("search") ?? "",
      role: searchParams.get("role") as ArchitectAccountDirectoryFilters["role"],
      status: searchParams.get("status") as ArchitectAccountDirectoryFilters["status"],
      onboarding: searchParams.get("onboarding") as ArchitectAccountDirectoryFilters["onboarding"]
    });
    const payload = await getArchitectAccountDirectoryPayload(access.user, filters);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load Architect accounts." },
      { status: 500 }
    );
  }
}
