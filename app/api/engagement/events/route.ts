import { NextResponse } from "next/server";
import { z } from "zod";
import { requireEngagementActor } from "@/lib/engagement/auth";
import { engagementErrorResponse } from "@/lib/engagement/http";
import { getEngagementProvider } from "@/lib/engagement/provider";

const eventSchema = z.object({
  eventType: z.enum([
    "appointment_booked",
    "appointment_rebooked",
    "waitlist_joined",
    "barber_followed",
    "barber_reviewed",
    "reward_redeemed",
    "service_completed",
    "review_received",
    "payout_released",
    "profile_updated",
    "portfolio_updated",
    "booking_accepted"
  ]),
  targetType: z.enum(["client", "barber", "owner", "location", "referral", "service"]),
  targetId: z.string().min(1),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
});

export async function POST(request: Request) {
  try {
    const actor = await requireEngagementActor(["owner", "manager", "front_desk", "commission_barber", "booth_rent_barber", "client"]);
    const payload = eventSchema.parse(await request.json());
    const engagementProvider = await getEngagementProvider();
    const result = await engagementProvider.recordEvent(actor, payload);
    return NextResponse.json({ event: result.event });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid engagement event payload." }, { status: 400 });
    }

    return engagementErrorResponse(error);
  }
}
