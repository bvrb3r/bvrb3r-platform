import "server-only";

import { isBarberAccountRole } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/booking/route-auth";
import { CalendarSyncError } from "@/lib/calendar-sync/domain";

export async function getCalendarBarberUser() {
  const user = await getSessionUser();
  if (!user.id || user.id === "guest-user") {
    throw new CalendarSyncError("Authentication required.", 401, "calendar_auth_required");
  }
  if (!isBarberAccountRole(user.role)) {
    throw new CalendarSyncError("Calendar connections are available only to Barber accounts.", 403, "calendar_barber_required");
  }
  return user;
}
