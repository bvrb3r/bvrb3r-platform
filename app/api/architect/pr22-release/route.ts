import { NextResponse } from "next/server";
import { readArchitectDebugEnvironment } from "@/lib/architect/debug/env";
import { requireArchitectDebugAccess } from "@/lib/architect/debug/guards";
import { rentErrorResponse } from "@/lib/rent/http";
import {
  getRentReleaseSnapshot,
  issueRentReleaseCertificate,
  RentServiceError
} from "@/lib/rent/service";

export async function GET() {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) return access.response;

  try {
    return NextResponse.json(await getRentReleaseSnapshot());
  } catch (error) {
    return rentErrorResponse(error, "Unable to load PR22 release truth.");
  }
}

export async function POST() {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) return access.response;

  try {
    const environment = readArchitectDebugEnvironment();
    if (!environment.commitHash || !environment.deploymentId) {
      throw new RentServiceError(
        "Release certificates can be issued only from a traceable Vercel deployment.",
        409
      );
    }
    return NextResponse.json(await issueRentReleaseCertificate({
      commitSha: environment.commitHash,
      deploymentId: environment.deploymentId
    }));
  } catch (error) {
    return rentErrorResponse(error, "Unable to issue the PR22 release certificate.");
  }
}
