import { NextResponse } from "next/server";
import {
  BarberProfileRepairError,
  ensureBarberProfileForIdentifier,
  ensureBarberProfileForUser,
  type BarberProfileRepairResult
} from "@/lib/barber/profile-repair";
import { getBarberDetailsPayload } from "@/lib/booking/platform-service";
import { getSessionUser } from "@/lib/booking/route-auth";
import { isBarberAccountRole } from "@/lib/auth/roles";

function repairErrorCode(error: unknown) {
  return error instanceof BarberProfileRepairError ? error.reason : "unknown";
}

function buildEditableBarberProfilePayload(repair: BarberProfileRepairResult) {
  const name = repair.barberProfile.display_name
    ?? repair.barberProfile.barber_email
    ?? repair.username
    ?? repair.barberReference;
  const compensationModel = repair.barber.compensation_model === "commission" ? "commission" : "booth_rent";
  const role = "barber";
  const username = repair.username;
  const bookingHref = `/booking/new?barberId=${encodeURIComponent(repair.barberReference)}`;

  return {
    barber: {
      id: repair.barberReference,
      userId: repair.profileId,
      name,
      role,
      appApprovalStatus: repair.barber.app_approval_status ?? "pending",
      shopApprovalStatus: repair.barber.shop_approval_status ?? "not_required",
      locationIds: [],
      specialties: repair.barberProfile.specialties ?? [],
      rating: 0,
      reviewCount: 0,
      compensationModel,
      todayEarnings: 0,
      upcomingPayout: 0,
      availabilityLabel: repair.barberProfile.next_available_at ? "Next available" : "Set availability",
      bio: repair.barberProfile.bio ?? repair.barber.bio ?? "",
      bookingLink: bookingHref
    },
    profile: {
      id: repair.barberProfile.id ?? repair.barberProfile.barber_reference,
      barberId: repair.barberReference,
      username,
      photoAccent: "#a3ff12",
      yearsExperience: repair.barberProfile.years_experience ?? 0,
      shopId: repair.barberProfile.shop_reference ?? undefined,
      headline: repair.barberProfile.bio ?? repair.barber.bio ?? "No public bio saved yet.",
      specialties: repair.barberProfile.specialties ?? [],
      badges: repair.barberProfile.badges ?? [],
      nextAvailableAt: repair.barberProfile.next_available_at ?? "",
      serviceAreaLabel: repair.barberProfile.service_area_label ?? "Service location setup in progress",
      visibilityState: repair.barberProfile.visibility_state ?? "hidden"
    },
    services: [],
    portfolio: [],
    reviews: [],
    nextAvailableAt: repair.barberProfile.next_available_at ?? "",
    shopLocations: [],
    priceRange: [0, 0],
    bookingCtaHref: bookingHref,
    editableProfileFallback: true
  };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let lookupId = id;
  let repairNotice: string | null = null;
  let repairFailure: unknown = null;
  let sessionRepair: BarberProfileRepairResult | null = null;

  try {
    const user = await getSessionUser();
    if (isBarberAccountRole(user.role)) {
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
      sessionRepair = repair;
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

  if (!sessionRepair) {
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
    if (sessionRepair?.success && sessionRepair.barberProfile) {
      return NextResponse.json({
        ...buildEditableBarberProfilePayload(sessionRepair),
        profileRepairNotice: repairNotice ?? "Profile already synced."
      });
    }

    const code = repairErrorCode(repairFailure);
    const error = code === "unknown" ? "barber_profile_not_found_after_repair" : code;
    return NextResponse.json({
      error,
      code,
      repairDetails: repairFailure instanceof BarberProfileRepairError ? repairFailure.details ?? null : null,
      detail: repairFailure instanceof Error ? repairFailure.message : "Canonical barber profile could not be loaded after repair."
    }, { status: code === "role_not_barber" ? 403 : 409 });
  }

  return NextResponse.json(repairNotice ? { ...payload, profileRepairNotice: repairNotice } : payload);
}
