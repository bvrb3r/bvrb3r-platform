import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMobileActor } from "@/lib/mobile/auth";
import { buildDeepLinkPayload, normalizeAppRoute } from "@/lib/mobile/links";
import { buildNativeBootstrapSummary } from "@/lib/mobile/native";
import { getMobileProvider } from "@/lib/mobile/provider";

const recordSchema = z.object({
  route: z.string().min(1),
  label: z.string().optional(),
  source: z.enum(["push", "share", "shortcut", "manual", "install_prompt", "native_wrap"]),
  deviceId: z.string().optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
});

function mobileErrorResponse(error: unknown) {
  const status = typeof error === "object" && error && "status" in error && typeof (error as { status?: number }).status === "number"
    ? (error as { status: number }).status
    : 500;
  const message = error instanceof Error
    ? error.message
    : "Something went wrong while building this deep link.";
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const route = normalizeAppRoute(searchParams.get("route") ?? "/");
  const label = searchParams.get("label") ?? "BVRB3R link";
  const role = z.enum(["shop_owner_user", "manager", "front_desk", "barber_user", "client_user"]).safeParse(searchParams.get("role"));
  return NextResponse.json({
    bundle: buildDeepLinkPayload(route, label),
    bootstrap: buildNativeBootstrapSummary(role.success ? role.data : "client_user")
  });
}

export async function POST(request: Request) {
  try {
    const actor = await requireMobileActor(["shop_owner_user", "manager", "front_desk", "barber_user", "client_user"]);
    const payload = recordSchema.parse(await request.json());
    const provider = await getMobileProvider();
    const record = await provider.recordDeepLink(actor, {
      ...payload,
      route: normalizeAppRoute(payload.route)
    });
    return NextResponse.json({ record });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid deep-link payload." }, { status: 400 });
    }

    return mobileErrorResponse(error);
  }
}
