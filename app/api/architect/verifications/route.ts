import { NextRequest, NextResponse } from "next/server";
import { requireArchitectAdmin } from "@/app/api/architect/verifications/_shared";
import { createEmptyArchitectVerificationQueuePayload, listVerificationProfilesForArchitect } from "@/lib/platform-admin/verification-service";
import type { ArchitectVerificationQueueFilters } from "@/types/platform-admin";

export async function GET(request: NextRequest) {
  try {
    const access = await requireArchitectAdmin();
    if (!access.ok) {
      return access.response;
    }

    const payload = await listVerificationProfilesForArchitect(access.user, {
      search: request.nextUrl.searchParams.get("search") ?? undefined,
      role: (request.nextUrl.searchParams.get("role") as "client" | "barber" | "shop_owner" | "all" | null) ?? undefined,
      overallStatus: (request.nextUrl.searchParams.get("overallStatus") ?? undefined) as ArchitectVerificationQueueFilters["overallStatus"],
      identityStatus: (request.nextUrl.searchParams.get("identityStatus") ?? undefined) as ArchitectVerificationQueueFilters["identityStatus"],
      licenseStatus: (request.nextUrl.searchParams.get("licenseStatus") ?? undefined) as ArchitectVerificationQueueFilters["licenseStatus"],
      businessStatus: (request.nextUrl.searchParams.get("businessStatus") ?? undefined) as ArchitectVerificationQueueFilters["businessStatus"],
      payoutStatus: (request.nextUrl.searchParams.get("payoutStatus") ?? undefined) as ArchitectVerificationQueueFilters["payoutStatus"],
      complianceStatus: (request.nextUrl.searchParams.get("complianceStatus") ?? undefined) as ArchitectVerificationQueueFilters["complianceStatus"],
      submittedOnly: request.nextUrl.searchParams.get("submittedOnly") === "true"
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[Architect Verification] queue route failed", error);
    return NextResponse.json(createEmptyArchitectVerificationQueuePayload(["Verification review data is partially unavailable. Core architect access is still active."]));
  }
}
