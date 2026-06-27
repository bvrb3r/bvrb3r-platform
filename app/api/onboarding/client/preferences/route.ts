import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOnboardingSessionUser, toOnboardingErrorResponse } from "@/app/api/onboarding/_shared";
import {
  CLIENT_BOOKING_TIMING_VALUES,
  CLIENT_FIRST_BOOKING_MISSION_VALUES,
  CLIENT_SEARCH_PRIORITY_VALUES,
  CLIENT_SERVICE_INTEREST_VALUES,
  getClientFirstBookingHref
} from "@/lib/onboarding/client-path";
import { markOnboardingStepComplete } from "@/lib/onboarding/service";

const schema = z.object({
  serviceInterest: z.enum(CLIENT_SERVICE_INTEREST_VALUES),
  bookingTiming: z.enum(CLIENT_BOOKING_TIMING_VALUES),
  searchPriority: z.enum(CLIENT_SEARCH_PRIORITY_VALUES),
  firstBookingMission: z.enum(CLIENT_FIRST_BOOKING_MISSION_VALUES),
  preferredServices: z.string().trim().optional().default(""),
  bookingCadence: z.string().trim().optional().default(""),
  notifications: z.string().trim().optional().default("")
});

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Client service interest, booking timing, search priority, and first booking mission are required." }, { status: 400 });
    }

    const user = await getOnboardingSessionUser();
    const result = await markOnboardingStepComplete(user, "client", "client_preferences", parsed.data);
    return NextResponse.json({
      state: result.state,
      degraded: result.degraded,
      nextPath: getClientFirstBookingHref(parsed.data)
    });
  } catch (error) {
    return toOnboardingErrorResponse(error);
  }
}

