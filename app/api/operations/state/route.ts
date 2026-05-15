import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isBarberAccountRole, normalizeAccountRole } from "@/lib/auth/roles";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";
import { LiveOperationsViewer } from "@/lib/operations/live-state";

const querySchema = z.object({
  view: z.enum(["booking", "front_desk", "barber", "owner", "manager", "client"]).default("booking")
});

function createForbiddenResponse() {
  return NextResponse.json({ error: "You do not have access to this operations view." }, { status: 403 });
}

async function resolveViewer(view: z.infer<typeof querySchema>["view"]): Promise<LiveOperationsViewer | null> {
  if (view === "booking") {
    return { role: "public" };
  }

  const { user } = await getCurrentUserFromServer();

  if (view === "owner") {
    return user.role === "owner" ? { role: user.role, locationIds: user.locationIds, barberId: user.barberId, clientId: user.clientId, email: user.email } : null;
  }

  if (view === "manager") {
    return user.role === "manager"
      ? { role: user.role, locationIds: user.locationIds, barberId: user.barberId, clientId: user.clientId, email: user.email }
      : null;
  }

  if (view === "front_desk") {
    return user.role === "front_desk"
      ? { role: user.role, locationIds: user.locationIds, barberId: user.barberId, clientId: user.clientId, email: user.email }
      : null;
  }

  if (view === "barber") {
    return isBarberAccountRole(user.role)
      ? { role: normalizeAccountRole(user.role), locationIds: user.locationIds, barberId: user.barberId, clientId: user.clientId, email: user.email }
      : null;
  }

  if (view === "client") {
    return user.role === "client"
      ? { role: user.role, locationIds: user.locationIds, barberId: user.barberId, clientId: user.clientId, email: user.email }
      : null;
  }

  return null;
}

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    view: request.nextUrl.searchParams.get("view") ?? "booking"
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid operations view." }, { status: 400 });
  }

  const viewer = await resolveViewer(parsed.data.view);
  if (!viewer) {
    return createForbiddenResponse();
  }

  const provider = await getLiveOperationsProvider();
  const snapshot = await provider.readSnapshot(viewer);
  return NextResponse.json(snapshot);
}
