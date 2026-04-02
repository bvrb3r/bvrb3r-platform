import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { getShopManagerPayload } from "@/lib/operations/shop-manager";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!(user.role === "owner" || user.role === "manager" || user.role === "front_desk")) {
      return NextResponse.json({ error: "Only owner, manager, or front desk can use the shop manager." }, { status: 403 });
    }

    const payload = await getShopManagerPayload(user);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load shop manager suggestions." },
      { status: 500 }
    );
  }
}
