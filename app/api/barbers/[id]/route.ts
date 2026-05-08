import { NextResponse } from "next/server";
import {
  BarberProfileRepairError,
  ensureBarberProfileForIdentifier,
  ensureBarberProfileForUser
} from "@/lib/barber/profile-repair";
import { getBarberDetailsPayload } from "@/lib/booking/platform-service";
import { getSessionUser } from "@/lib/booking/route-auth";

function isBarberRole(role: string) {
  return role === "commission_barber" || role === "booth_rent_barber";
}

function repairErrorCode(error: unknown) {
  return error instanceof BarberProfileRepairError ? error.reason : "unknown";
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let lookupId = id;
  let repairNotice: string | null = null;
  let repairFailure: unknown = null;

  try {
    const user = await getSessionUser();
    if (isBarberRole(user.role)) {
      const repair = await ensureBarberProfileForUser({
        userId: user.id,
        barberId: user.barberId ?? id,
        role: user.role,
        email: user.email,
        fullName: user.name,
        phone: user.phone,
        preferredUsername: user.barberId ?? id,
        appApprovalStatus: user.appApprovalStatus
      });
      lookupId = repair.barberReference;
      repairNotice = repair.repaired ? repair.message : null;
    }
  } catch (error) {
    repairFailure = error;
    console.error("[barbers-api] session barber profile repair failed", {
      id,
      reason: repairErrorCode(error),
      message: error instanceof Error ? error.message : String(error)
    });
  }

  if (!repairNotice) {
    const repair = await ensureBarberProfileForIdentifier(id).catch((error) => {
      repairFailure = repairFailure ?? error;
      console.error("[barbers-api] identifier barber profile repair failed", {
        id,
        reason: repairErrorCode(error),
        message: error instanceof Error ? error.message : String(error)
      });
      return null;
    });
    if (repair) {
      lookupId = repair.barberReference;
      repairNotice = repair.repaired ? repair.message : null;
    }
  }

  const payload = await getBarberDetailsPayload(lookupId);

  if (!payload) {
    const code = repairErrorCode(repairFailure);
    const error = code === "unknown" ? "barber_profile_not_found_after_repair" : code;
    return NextResponse.json({
      error,
      code,
      detail: repairFailure instanceof Error ? repairFailure.message : "Canonical barber profile could not be loaded after repair."
    }, { status: code === "role_not_barber" ? 403 : 409 });
  }

  return NextResponse.json(repairNotice ? { ...payload, profileRepairNotice: repairNotice } : payload);
}
