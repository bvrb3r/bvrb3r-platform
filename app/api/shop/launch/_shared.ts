import { NextResponse } from "next/server";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { Pr36PrelaunchServiceError } from "@/lib/shops/pr36-prelaunch-service";

export async function requirePr36OwnerSession() {
  const session = await getCurrentUserFromServer();
  if (!session.authenticated || session.user.id === "guest-user" || session.user.role !== "shop_owner_user") {
    throw new Pr36PrelaunchServiceError("A signed-in Shop Owner is required.", 401, "shop_launch_auth_required");
  }
  return session.user;
}

export function pr36LaunchJson(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}

export function pr36LaunchError(error: unknown) {
  if (error instanceof Pr36PrelaunchServiceError) {
    return pr36LaunchJson({ error: error.message, code: error.code }, error.status);
  }
  return pr36LaunchJson({ error: "Shop launch could not complete that request.", code: "shop_launch_failed" }, 500);
}
