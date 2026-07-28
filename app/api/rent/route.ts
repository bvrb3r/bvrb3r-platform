import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { rentErrorResponse } from "@/lib/rent/http";
import { getRentWorkspacePayload } from "@/lib/rent/service";

export async function GET() {
  try {
    const user = await getSessionUser();
    return NextResponse.json(await getRentWorkspacePayload(user));
  } catch (error) {
    return rentErrorResponse(error, "Unable to load booth rent.");
  }
}
