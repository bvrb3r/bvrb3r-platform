import { NextResponse } from "next/server";
import { z } from "zod";
import { requireArchitectAdmin } from "@/app/api/architect/verifications/_shared";
import { applyPlatformAdminAction } from "@/lib/platform-admin/service";

const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("set_user_status"),
    userId: z.string().trim().min(1),
    nextStatus: z.enum(["active", "deactivated", "suspended", "banned"]),
    note: z.string().trim().max(400).optional()
  }),
  z.object({
    type: z.literal("set_shop_status"),
    shopId: z.string().trim().min(1),
    nextStatus: z.enum(["active", "inactive"]),
    note: z.string().trim().max(400).optional()
  }),
  z.object({
    type: z.literal("set_shop_control"),
    shopId: z.string().trim().min(1),
    controlKey: z.enum(["kiosk_enabled", "ai_manager_enabled"]),
    enabled: z.boolean(),
    note: z.string().trim().max(400).optional()
  }),
  z.object({
    type: z.literal("update_barber_verification"),
    barberId: z.string().trim().min(1),
    category: z.enum(["identity_verification", "license_verification", "payout_verification", "shop_affiliation_verification"]),
    status: z.enum(["unverified", "pending", "verified", "rejected", "expired"]),
    note: z.string().trim().max(400).optional()
  }),
  z.object({
    type: z.literal("update_shop_verification"),
    shopId: z.string().trim().min(1),
    category: z.enum(["business_verification", "ownership_verification"]),
    status: z.enum(["unverified", "pending", "verified", "rejected", "expired"]),
    note: z.string().trim().max(400).optional()
  }),
  z.object({
    type: z.literal("resolve_dispute"),
    disputeId: z.string().trim().min(1),
    note: z.string().trim().max(400).optional()
  }),
  z.object({
    type: z.literal("resolve_financial_anomaly"),
    anomalyId: z.string().trim().min(1),
    note: z.string().trim().max(400).optional()
  }),
  z.object({
    type: z.literal("dismiss_financial_anomaly"),
    anomalyId: z.string().trim().min(1),
    note: z.string().trim().max(400).optional()
  })
]);

export async function POST(request: Request) {
  try {
    const access = await requireArchitectAdmin();
    if (!access.ok) {
      return access.response;
    }

    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid Architect Console action payload." }, { status: 400 });
    }

    const result = await applyPlatformAdminAction(access.user, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to apply this Architect Console action." },
      { status: 500 }
    );
  }
}
