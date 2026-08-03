import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { rentErrorResponse } from "@/lib/rent/http";
import { getRentOperationsPayload } from "@/lib/rent/service";

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    const shopId = new URL(request.url).searchParams.get("shopId");
    return NextResponse.json(await getRentOperationsPayload(user, shopId));
  } catch (error) {
    return rentErrorResponse(error, "Unable to load booth rent.");
  }
}
