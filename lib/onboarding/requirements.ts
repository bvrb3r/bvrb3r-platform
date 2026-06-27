import type { MoreSubtitle, OnboardingRequirement, ReadinessKey, ReadinessLevel } from "@/lib/onboarding/types";

export const READINESS_SECTION_META: Record<ReadinessKey, { level: ReadinessLevel; label: string }> = {
  publicGuest: { level: "public_guest_ready", label: "Public / Guest Ready" },
  browse: { level: "browse_ready", label: "Browse Ready" },
  account: { level: "account_ready", label: "Account Ready" },
  booking: { level: "booking_ready", label: "Booking Ready" },
  culture: { level: "culture_ready", label: "Culture Ready" },
  barberBusiness: { level: "barber_business_ready", label: "Barber Business Ready" },
  payout: { level: "payout_ready", label: "Payout Ready" },
  shop: { level: "shop_ready", label: "Shop Ready" },
  kiosk: { level: "kiosk_ready", label: "Kiosk Ready" }
};

export const CLIENT_MORE_SUBTITLES = [
  "BVRB3R App Settings",
  "Client Content Creator Settings",
  "Payments & Banking",
  "Compliance & Security",
  "Support",
  "Account session"
] as const satisfies readonly MoreSubtitle[];

export const BARBER_MORE_SUBTITLES = [
  "BVRB3R App Settings",
  "Barber Business Settings",
  "Payments & Banking",
  "Compliance & Security",
  "Support",
  "Account session"
] as const satisfies readonly MoreSubtitle[];

export const SHOP_OWNER_MORE_SUBTITLES = [
  "BVRB3R App Settings",
  "SHOP BUSINESS SETTINGS",
  "Payments & Banking",
  "Compliance & Security",
  "Support",
  "Account session"
] as const satisfies readonly MoreSubtitle[];

export const ACCOUNT_REQUIREMENTS = {
  auth: requirement("account.auth", "Sign in or create your account", "A controlled account session is required before private dashboard actions.", "critical", "Account session"),
  role: requirement("account.role", "Choose Client, Barber, or Shop Owner", "Public account access must use one of the three controlled BVRB3R roles.", "critical", "BVRB3R App Settings"),
  name: requirement("account.name", "Add your name", "BVRB3R needs a real display name before personal surfaces can be trusted.", "setup", "BVRB3R App Settings"),
  username: requirement("account.username", "Claim your BVRB3R name", "Your public handle powers profile links, booking references, and discovery.", "setup", "BVRB3R App Settings"),
  contact: requirement("account.contact", "Add email or phone", "BVRB3R needs a reliable contact method for account and booking updates.", "critical", "BVRB3R App Settings"),
  rules: requirement("account.rules", "Accept BVRB3R trust rules", "Trust and platform rules must be accepted before serious actions unlock.", "critical", "Compliance & Security")
} as const;

export const BOOKING_REQUIREMENTS = {
  identity: requirement("booking.identity", "Finish booking identity", "Booking requires a name and reliable contact before final confirmation.", "critical", "BVRB3R App Settings"),
  verifiedPhone: requirement("booking.verifiedPhone", "Verify your phone for booking", "This booking path requires verified phone evidence before final confirmation.", "critical", "BVRB3R App Settings"),
  provider: requirement("booking.provider", "Choose a barber or shop", "A real barber or shop must be selected before an appointment can be confirmed.", "critical"),
  service: requirement("booking.service", "Choose a service", "A service is required before BVRB3R can create an appointment.", "critical"),
  time: requirement("booking.time", "Choose a time", "A booking time is required before BVRB3R can create an appointment.", "critical"),
  payment: requirement("booking.payment", "Add a payment method", "Paid booking confirmation requires a provider reference, not raw card data.", "critical", "Payments & Banking"),
  policy: requirement("booking.policy", "Accept booking policy", "The booking policy must be accepted before final confirmation.", "critical", "Compliance & Security"),
  serverProof: requirement("booking.serverProof", "Connect booking proof", "Booking readiness needs server proof before it can be treated as complete.", "review")
} as const;

export const CULTURE_REQUIREMENTS = {
  supported: requirement("culture.supported", "Culture posting support is not connected", "Culture readiness can be tracked now, but unsupported posting must stay gated.", "review"),
  username: requirement("culture.username", "Claim your BVRB3R name", "Culture identity requires a public handle.", "setup", "BVRB3R App Settings"),
  visibility: requirement("culture.visibility", "Finish culture profile visibility", "Culture actions need safe profile visibility before posting unlocks.", "setup", "Client Content Creator Settings"),
  rules: requirement("culture.rules", "Accept culture rules", "Culture rules must be accepted before posting can unlock.", "critical", "Compliance & Security"),
  standing: requirement("culture.standing", "Resolve account standing", "Limited or blocked account standing cannot post culture content.", "critical", "Compliance & Security")
} as const;

export const BARBER_BUSINESS_REQUIREMENTS = {
  barberRecord: requirement("barber.record", "Create barber business record", "A barber business record is required before the profile can become bookable.", "critical", "Barber Business Settings"),
  displayName: requirement("barber.displayName", "Add public barber name", "Clients need a clear barber name before booking.", "setup", "Barber Business Settings"),
  username: requirement("barber.username", "Claim your BVRB3R name", "Public barber discovery needs a profile handle.", "setup", "Barber Business Settings"),
  profile: requirement("barber.profile", "Finish barber profile identity", "Use a real profile photo or an approved safe placeholder before publishing.", "setup", "Barber Business Settings"),
  service: requirement("barber.service", "Add your first active service", "Bookable barbers need at least one active service.", "critical", "Barber Business Settings"),
  price: requirement("barber.price", "Add service price", "Service price is required before clients can book.", "critical", "Barber Business Settings"),
  duration: requirement("barber.duration", "Add service duration", "Service duration is required before availability can be trusted.", "critical", "Barber Business Settings"),
  schedule: requirement("barber.schedule", "Set your schedule", "Availability must exist before clients can book.", "critical", "Barber Business Settings"),
  bookingMode: requirement("barber.bookingMode", "Choose booking mode", "Booking mode controls how clients can request time.", "critical", "Barber Business Settings")
} as const;

export const PAYOUT_REQUIREMENTS = {
  lane: requirement("payout.lane", "Choose payout lane", "Payout readiness needs the payment lane selected before provider checks can pass.", "critical", "Payments & Banking"),
  providerTruth: requirement("payout.providerTruth", "Connect payout provider truth", "Money readiness must come from server/provider evidence, not frontend state.", "critical", "Payments & Banking"),
  provider: requirement("payout.provider", "Connect Stripe or Square setup", "A supported provider setup posture is required before payouts can unlock.", "critical", "Payments & Banking"),
  identity: requirement("payout.identity", "Complete payout identity verification", "Provider identity verification is required before money can move.", "critical", "Payments & Banking"),
  status: requirement("payout.status", "Resolve payout provider status", "Provider payout status must be ready from server truth.", "critical", "Payments & Banking"),
  terms: requirement("payout.terms", "Accept payout terms", "Payout terms must be accepted before payout eligibility can pass.", "critical", "Compliance & Security")
} as const;

export const SHOP_REQUIREMENTS = {
  authority: requirement("shop.authority", "Confirm shop owner authority", "Shop readiness requires owner authority before publishing or team actions.", "critical", "SHOP BUSINESS SETTINGS"),
  record: requirement("shop.record", "Create shop record", "A real shop record is required before shop tools can publish.", "critical", "SHOP BUSINESS SETTINGS"),
  name: requirement("shop.name", "Add shop name", "A public shop name is required before discovery.", "setup", "SHOP BUSINESS SETTINGS"),
  username: requirement("shop.username", "Claim shop BVRB3R name", "Shop discovery needs a public handle.", "setup", "SHOP BUSINESS SETTINGS"),
  location: requirement("shop.location", "Add shop location", "Location is required before shop publishing, booking, and kiosk readiness.", "critical", "SHOP BUSINESS SETTINGS"),
  hours: requirement("shop.hours", "Add shop hours", "Hours are required before shop booking and kiosk readiness.", "critical", "SHOP BUSINESS SETTINGS"),
  chairs: requirement("shop.chairs", "Add chair count", "Chair capacity is required before shop operations can be trusted.", "critical", "SHOP BUSINESS SETTINGS"),
  operatingModel: requirement("shop.operatingModel", "Choose operating model", "Booth rent, commission, mixed, and owner-operated are business models, not account roles.", "critical", "SHOP BUSINESS SETTINGS"),
  bookingMode: requirement("shop.bookingMode", "Choose shop booking mode", "Shop booking mode must be set before public booking can publish.", "critical", "SHOP BUSINESS SETTINGS"),
  policies: requirement("shop.policies", "Finish shop policies", "Shop policies must exist before publishing and kiosk activation.", "critical", "SHOP BUSINESS SETTINGS"),
  paymentModel: requirement("shop.paymentModel", "Choose shop payment model", "Shop payment posture must be configured before money surfaces can be trusted.", "critical", "Payments & Banking"),
  verification: requirement("shop.verification", "Finish shop verification", "Shop verification must be approved before full publishing.", "critical", "Compliance & Security")
} as const;

export const KIOSK_REQUIREMENTS = {
  shopReady: requirement("kiosk.shopReady", "Finish shop setup first", "Kiosk readiness depends on Shop Ready prerequisites.", "critical", "SHOP BUSINESS SETTINGS"),
  shopActive: requirement("kiosk.shopActive", "Activate shop before kiosk", "The shop must be active before kiosk mode can unlock.", "critical", "SHOP BUSINESS SETTINGS"),
  chairs: requirement("kiosk.chairs", "Activate chairs", "Kiosk routing needs active chair capacity.", "critical", "SHOP BUSINESS SETTINGS"),
  team: requirement("kiosk.team", "Confirm team eligibility", "Kiosk routing requires eligible barbers or team coverage.", "critical", "SHOP BUSINESS SETTINGS"),
  bookingMode: requirement("kiosk.bookingMode", "Set kiosk booking mode", "Kiosk booking mode must be configured before activation.", "critical", "SHOP BUSINESS SETTINGS"),
  walkInMode: requirement("kiosk.walkInMode", "Set walk-in mode", "Walk-in behavior must be configured before kiosk activation.", "critical", "SHOP BUSINESS SETTINGS"),
  sessionRules: requirement("kiosk.sessionRules", "Set kiosk session rules", "Public kiosk sessions need clear rules before launch.", "critical", "Compliance & Security"),
  rotationMode: requirement("kiosk.rotationMode", "Choose rotation mode", "Kiosk routing cannot fake realtime or wait-time behavior.", "critical", "SHOP BUSINESS SETTINGS"),
  notifications: requirement("kiosk.notifications", "Set kiosk notifications", "Kiosk updates need notification posture before activation.", "setup", "BVRB3R App Settings")
} as const;

function requirement(
  id: string,
  label: string,
  description: string,
  severity: "critical" | "setup" | "review",
  moreSubtitle?: MoreSubtitle
): OnboardingRequirement {
  return {
    id,
    label,
    description,
    severity,
    critical: severity === "critical",
    moreSubtitle
  };
}
