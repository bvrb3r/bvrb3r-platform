import { pr36LaunchError, pr36LaunchJson, requirePr36OwnerSession } from "@/app/api/shop/launch/_shared";
import { goLivePr36Shop } from "@/lib/shops/pr36-prelaunch-service";

export async function POST(request: Request) {
  try {
    const user = await requirePr36OwnerSession();
    const body = await request.json().catch(() => ({})) as { expectedVersion?: unknown };
    const launch = await goLivePr36Shop({
      user,
      expectedVersion: body.expectedVersion,
      idempotencyKey: request.headers.get("idempotency-key")
    });
    return pr36LaunchJson({ ok: true, launch });
  } catch (error) {
    return pr36LaunchError(error);
  }
}
