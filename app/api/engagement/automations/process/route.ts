import { NextResponse } from "next/server";
import { processBackgroundAutomationRuns } from "@/lib/automation/service";
import { engagementErrorResponse } from "@/lib/engagement/http";
import { getEngagementProvider } from "@/lib/engagement/provider";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";

function readAutomationSecret(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  return request.headers.get("x-bvrb3r-automation-secret")?.trim();
}

function parseLocationIds(body: unknown) {
  if (!body || typeof body !== "object" || !("locationIds" in body)) {
    return [] as string[];
  }

  const value = (body as { locationIds?: unknown }).locationIds;
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()));
}

export async function POST(request: Request) {
  try {
    const configuredSecret = process.env.AUTOMATION_PROCESS_SECRET?.trim();
    if (!configuredSecret) {
      return NextResponse.json({ error: "Background automation processing is not configured yet." }, { status: 503 });
    }

    const providedSecret = readAutomationSecret(request);
    if (!providedSecret || providedSecret !== configuredSecret) {
      return NextResponse.json({ error: "You do not have access to this automation processing action." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const locationIds = parseLocationIds(body);
    const [engagementProvider, operationsProvider] = await Promise.all([
      getEngagementProvider(),
      getLiveOperationsProvider()
    ]);
    const [state, snapshot] = await Promise.all([
      engagementProvider.readState(),
      operationsProvider.readSnapshot({
        role: "owner",
        email: "automation@bvrb3r.internal",
        locationIds
      })
    ]);

    return NextResponse.json(await processBackgroundAutomationRuns(state, snapshot, locationIds));
  } catch (error) {
    return engagementErrorResponse(error);
  }
}
