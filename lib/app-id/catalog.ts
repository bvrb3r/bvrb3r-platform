export const APP_ID_ROLES = ["client_user", "barber_user", "shop_owner_user"] as const;

export type AppIdentityRole = (typeof APP_ID_ROLES)[number];

export type AppIdentityPublicReference = {
  username: string | null;
  barberId: string | null;
  shopId: string | null;
};

export type AppIdentityScanAction = {
  title: string;
  detail: string;
  href: string | null;
  availability: "available" | "requires_setup";
};

export function isAppIdentityRole(value: unknown): value is AppIdentityRole {
  return APP_ID_ROLES.includes(value as AppIdentityRole);
}

function encoded(value: string) {
  return encodeURIComponent(value);
}

export function appIdentityRoleLabel(role: AppIdentityRole, verified: boolean) {
  if (role === "client_user") return "CLIENT";
  if (role === "barber_user") return verified ? "BARBER · VERIFIED" : "BARBER";
  return verified ? "SHOP · VERIFIED" : "SHOP";
}

export function appIdentityScanHint(role: AppIdentityRole) {
  if (role === "client_user") return "Scan to connect";
  if (role === "barber_user") return "Scan to book this chair";
  return "Scan to walk in";
}

export function buildAppIdentityScanActions(
  role: AppIdentityRole,
  reference: AppIdentityPublicReference
): AppIdentityScanAction[] {
  if (role === "client_user") {
    return [
      {
        title: "Follow & connect",
        detail: "Open this member’s public Culture profile. Following remains an explicit signed-in action.",
        href: reference.username ? `/client/${encoded(reference.username)}` : null,
        availability: reference.username ? "available" : "requires_setup"
      },
      {
        title: "Check in",
        detail: "Open the real paired-kiosk check-in rail; the kiosk still verifies the appointment or queue spot.",
        href: "/kiosk/checkin",
        availability: "available"
      },
      {
        title: "Claim your visit",
        detail: "Open secure booking support to match a guest visit after identity checks.",
        href: "/bookings?support=1",
        availability: "available"
      },
      {
        title: "Referral credit",
        detail: "Referral attribution stays unavailable until the signed onboarding handoff is connected; SET 1 completion remains required.",
        href: null,
        availability: "requires_setup"
      }
    ];
  }

  if (role === "barber_user") {
    const profileHref = reference.username ? `/barber/${encoded(reference.username)}` : null;
    const bookHref = reference.username
      ? `/booking/new?barber=${encoded(reference.username)}&source=public_profile`
      : reference.barberId
        ? `/booking/new?barberId=${encoded(reference.barberId)}&source=public_profile`
        : null;
    return [
      {
        title: "Book this chair",
        detail: "Open the real booking flow for services, availability, and Stripe-backed checkout.",
        href: bookHref,
        availability: bookHref ? "available" : "requires_setup"
      },
      {
        title: "Follow the work",
        detail: "Open the barber’s public Culture portfolio; following remains explicit.",
        href: profileHref,
        availability: profileHref ? "available" : "requires_setup"
      },
      {
        title: "Verify the license",
        detail: "Open the public profile’s verification evidence. No private document or number is exposed.",
        href: profileHref,
        availability: profileHref ? "available" : "requires_setup"
      },
      {
        title: "Join the waitlist",
        detail: "Open the booking rail where the real waitlist appears when no honest time is available.",
        href: bookHref,
        availability: bookHref ? "available" : "requires_setup"
      }
    ];
  }

  const shopHref = reference.shopId ? `/shop/${encoded(reference.shopId)}` : null;
  return [
    {
      title: "Walk in",
      detail: "Open the shop’s live mobile kiosk flow for the next available chair or a selected barber.",
      href: reference.shopId ? `/kiosk/shop/${encoded(reference.shopId)}?mode=check-in` : null,
      availability: reference.shopId ? "available" : "requires_setup"
    },
    {
      title: "See the shop",
      detail: "Open the public shop profile for its team, services, hours, reviews, and wall.",
      href: shopHref,
      availability: shopHref ? "available" : "requires_setup"
    },
    {
      title: "Join the team",
      detail: "Open the signed-in barber setup rail to review real open-chair terms and request a relationship.",
      href: reference.shopId ? `/dashboard/barber/setup?shop=${encoded(reference.shopId)}` : null,
      availability: reference.shopId ? "available" : "requires_setup"
    },
    {
      title: "Verify the business",
      detail: "Open public business-verification state without exposing registration documents or money.",
      href: shopHref,
      availability: shopHref ? "available" : "requires_setup"
    }
  ];
}
