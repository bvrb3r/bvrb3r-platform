import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { readScheduledExecutionStatus, runScheduledFintechJobs } from "@/lib/cron/fintech";

const runSchema = z.object({
  locationIds: z.array(z.string().min(1)).optional()
});

function readAutomationSecret(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  return request.headers.get("x-bvrb3r-automation-secret")?.trim();
}

export async function GET() {
  const user = await getSessionUser();
  if (!(user.role === "owner" || user.role === "manager")) {
    return NextResponse.json({ error: "Only owners or managers can view scheduled execution status." }, { status: 403 });
  }

  try {
    const status = await readScheduledExecutionStatus({
      locationIds: user.role === "owner" ? user.locationIds : user.locationIds
    });
    return NextResponse.json({ status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load scheduled execution status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const configuredSecret = process.env.AUTOMATION_PROCESS_SECRET?.trim();
  const providedSecret = readAutomationSecret(request);

  if (configuredSecret && providedSecret && providedSecret === configuredSecret) {
    const parsed = runSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid scheduled execution payload." }, { status: 400 });
    }

    try {
      const jobs = await runScheduledFintechJobs({
        locationIds: parsed.data.locationIds ?? [],
        triggerSource: "scheduled",
        actorUserId: "scheduled-job",
        actorRole: "owner"
      });
      return NextResponse.json({ jobs });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to run scheduled execution jobs.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const user = await getSessionUser();
  if (!(user.role === "owner" || user.role === "manager")) {
    return NextResponse.json({ error: "Only owners or managers can run scheduled execution jobs." }, { status: 403 });
  }

  try {
    const jobs = await runScheduledFintechJobs({
      locationIds: user.locationIds,
      triggerSource: "manual",
      actorUserId: user.id,
      actorRole: user.role
    });
    return NextResponse.json({ jobs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run scheduled execution jobs.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
