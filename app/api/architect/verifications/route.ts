import { NextRequest, NextResponse } from "next/server";
import { isPlatformAdminUser } from "@/lib/auth/demo-auth";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { createEmptyArchitectVerificationQueuePayload, listVerificationProfilesForArchitect } from "@/lib/platform-admin/verification-service";
import type { ArchitectVerificationQueueFilters } from "@/types/platform-admin";

export async function GET(request: NextRequest) {
  try {
    const { user } = await getCurrentUserFromServer();
    if (user.accountStatus && user.accountStatus !== "active") {
      return NextResponse.json({ error: "Account access is disabled." }, { status: 403 });
    }

    if (!isPlatformAdminUser(user)) {
      return NextResponse.json({ error: "Architect verification access is restricted to the platform admin." }, { status: 403 });
    }

    const payload = await listVerificationProfilesForArchitect(user, {
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
