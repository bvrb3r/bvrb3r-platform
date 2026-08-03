import { pr36LaunchError, pr36LaunchJson, requirePr36OwnerSession } from "@/app/api/shop/launch/_shared";
import { configurePr36Prelaunch } from "@/lib/shops/pr36-prelaunch-service";

export async function POST(request: Request) {
  try {
    const user = await requirePr36OwnerSession();
    const body = await request.json().catch(() => ({})) as {
      openingAt?: unknown;
      chairCapacity?: unknown;
      expectedVersion?: unknown;
    };
    const launch = await configurePr36Prelaunch({
      user,
      openingAt: body.openingAt,
      chairCapacity: body.chairCapacity,
      expectedVersion: body.expectedVersion,
      idempotencyKey: request.headers.get("idempotency-key")
    });
    return pr36LaunchJson({ ok: true, launch });
  } catch (error) {
    return pr36LaunchError(error);
  }
}
