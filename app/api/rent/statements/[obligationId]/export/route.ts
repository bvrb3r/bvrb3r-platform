import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { rentErrorResponse } from "@/lib/rent/http";
import { exportRentStatement } from "@/lib/rent/service";

export async function GET(
  request: Request,
  context: { params: Promise<{ obligationId: string }> }
) {
  try {
    const user = await getSessionUser();
    const { obligationId } = await context.params;
    const url = new URL(request.url);
    const format = url.searchParams.get("format");
    const shopId = url.searchParams.get("shopId");
    if (!z.string().uuid().safeParse(obligationId).success || !["csv", "pdf"].includes(format ?? "")) {
      return Response.json({ error: "Choose a valid statement and export format." }, { status: 400 });
    }
    const exported = await exportRentStatement(
      user,
      obligationId,
      format as "csv" | "pdf",
      shopId
    );
    return new Response(exported.body, {
      headers: {
        "Content-Type": exported.contentType,
        "Content-Disposition": `attachment; filename="bvrb3r-rent-statement-${obligationId}.${exported.extension}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return rentErrorResponse(error, "Unable to export this rent statement.");
  }
}
