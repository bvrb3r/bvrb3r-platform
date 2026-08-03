import { getCurrentUserFromServer } from "@/lib/auth/session";
import { isRoadRole } from "@/lib/road/catalog";
import { buildRoadHomeSummary } from "@/lib/road/home-summary";
import { loadRoadSnapshot, RoadServiceError } from "@/lib/road/service.server";

export const dynamic = "force-dynamic";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie"
};

export async function GET() {
  try {
    const session = await getCurrentUserFromServer();
    if (session.authenticated === false || session.user.id === "guest-user") {
      return Response.json({ error: "Sign in to view Road progress." }, { status: 401, headers: privateHeaders });
    }
    if (!isRoadRole(session.user.role)) {
      return Response.json({ error: "This account does not have a Road." }, { status: 403, headers: privateHeaders });
    }

    const snapshot = await loadRoadSnapshot(session.user);
    return Response.json(
      { summary: buildRoadHomeSummary(snapshot) },
      { headers: privateHeaders }
    );
  } catch (error) {
    const status = error instanceof RoadServiceError ? error.status : 500;
    return Response.json(
      { error: status === 503 ? "Road progress is temporarily unavailable." : "Road progress could not be verified." },
      { status, headers: privateHeaders }
    );
  }
}
