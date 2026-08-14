import { NextResponse } from "next/server";
import { isClientRole } from "@/lib/auth/roles";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import {
  claimMatchingClientBridgeHistory,
  ClientBridgeServiceError
} from "@/lib/clientbridge/service";

export const dynamic = "force-dynamic";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie"
};

export async function POST() {
  const session = await getCurrentUserFromServer();
  if (!session.authenticated) {
    return NextResponse.json({ error: "Sign in to resolve guest history." }, { status: 401, headers: privateHeaders });
  }
  if (!isClientRole(session.user.role)) {
    return NextResponse.json({ error: "Guest history belongs to client accounts only." }, { status: 403, headers: privateHeaders });
  }

  try {
    const resolution = await claimMatchingClientBridgeHistory(session.user);
    return NextResponse.json(
      { resolution },
      { headers: privateHeaders }
    );
  } catch (error) {
    if (error instanceof ClientBridgeServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    }
    return NextResponse.json({ error: "Guest history could not be resolved." }, { status: 500, headers: privateHeaders });
  }
}
