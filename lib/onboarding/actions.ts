import type { OnboardingAction, OnboardingAuditEventName } from "@/lib/onboarding/types";

export const ONBOARDING_AUDIT_EVENT_NAMES = [
  "onboarding_started",
  "intent_selected",
  "source_channel_selected",
  "role_selected",
  "auth_completed",
  "name_added",
  "username_created",
  "phone_verified",
  "email_verified",
  "location_selected",
  "notification_permission_granted",
  "rules_accepted",
  "client_setup_started",
  "barber_setup_started",
  "shop_setup_started",
  "onboarding_completed",
  "dashboard_opened",
  "first_action_completed"
] as const satisfies readonly OnboardingAuditEventName[];

export const READINESS_ACTIONS = {
  browse: action("browse", "Start browsing", "Browse public barbers, shops, and culture before private actions unlock.", "/", undefined),
  chooseRole: action("chooseRole", "Choose Client, Barber, or Shop Owner", "Pick a controlled BVRB3R role card before dashboard access.", "/more", "BVRB3R App Settings"),
  authenticate: action("authenticate", "Sign in or create your account", "Connect a real account session before private actions unlock.", "/login", "Account session"),
  addName: action("addName", "Add your name", "Add the name BVRB3R can use for trusted account and booking flows.", "/more", "BVRB3R App Settings"),
  claimUsername: action("claimUsername", "Claim your BVRB3R name", "Create the public handle used by profiles, booking references, and culture.", "/more", "BVRB3R App Settings"),
  addContact: action("addContact", "Add contact information", "Add email or phone so BVRB3R can reach you for account and booking updates.", "/more", "BVRB3R App Settings"),
  acceptRules: action("acceptRules", "Accept BVRB3R trust rules", "Accept the platform rules required before serious actions unlock.", "/more", "Compliance & Security"),
  finishBookingIdentity: action("finishBookingIdentity", "Finish booking identity", "Add the identity and contact details required for appointment confirmation.", "/search", "BVRB3R App Settings"),
  verifyPhone: action("verifyPhone", "Verify your phone", "Verify your phone before this booking path can confirm.", "/more", "BVRB3R App Settings"),
  chooseProvider: action("chooseProvider", "Choose a barber or shop", "Pick the provider for this booking draft.", "/search", undefined),
  chooseService: action("chooseService", "Choose a service", "Select the service before appointment confirmation.", "/search", undefined),
  chooseTime: action("chooseTime", "Choose a time", "Select a real appointment time before confirmation.", "/search", undefined),
  addPaymentMethod: action("addPaymentMethod", "Add a payment method", "Use provider-backed payment setup for paid booking confirmation.", "/more", "Payments & Banking"),
  acceptBookingPolicy: action("acceptBookingPolicy", "Accept booking policy", "Accept the appointment policy before final confirmation.", "/search", "Compliance & Security"),
  finishCultureRules: action("finishCultureRules", "Accept culture rules", "Accept culture rules before posting can unlock.", "/more", "Compliance & Security"),
  createBarberRecord: action("createBarberRecord", "Start barber business setup", "Create the barber business record that powers your public profile.", "/barber/more", "Barber Business Settings"),
  addBarberService: action("addBarberService", "Add your first active service", "Create a priced service with duration before clients can book.", "/barber/more", "Barber Business Settings"),
  setBarberSchedule: action("setBarberSchedule", "Set your schedule", "Add availability before your profile can become bookable.", "/barber/more", "Barber Business Settings"),
  chooseBookingMode: action("chooseBookingMode", "Choose booking mode", "Choose how clients can request time.", "/barber/more", "Barber Business Settings"),
  finishPayoutSetup: action("finishPayoutSetup", "Finish payout setup", "Connect provider-backed payout readiness before money movement can unlock.", "/barber/more", "Payments & Banking"),
  createShopRecord: action("createShopRecord", "Start shop setup", "Create the shop record before publishing, team, or kiosk actions.", "/owner/more", "SHOP BUSINESS SETTINGS"),
  addShopLocation: action("addShopLocation", "Add shop location", "Add location before shop publishing, booking, or kiosk activation.", "/owner/more", "SHOP BUSINESS SETTINGS"),
  finishShopPolicies: action("finishShopPolicies", "Finish shop policies", "Complete shop policies before publishing or kiosk activation.", "/owner/more", "SHOP BUSINESS SETTINGS"),
  inviteFirstBarber: action("inviteFirstBarber", "Invite your first barber", "Add eligible team coverage before kiosk routing can pass.", "/owner/more", "SHOP BUSINESS SETTINGS"),
  prepareKioskSettings: action("prepareKioskSettings", "Prepare kiosk settings", "Complete kiosk mode, walk-in, session, rotation, and notification settings.", "/owner/more", "SHOP BUSINESS SETTINGS"),
  connectProof: action("connectProof", "Connect server proof", "Connect server/domain proof before this readiness can pass.", "/more", "Compliance & Security"),
  openHome: action("openHome", "Open your Home", "Continue from the safest Home surface for your current role.", "/", undefined)
} as const;

function action(id: string, label: string, description: string, href: string, moreSubtitle: OnboardingAction["moreSubtitle"]): OnboardingAction {
  return { id, label, description, href, moreSubtitle };
}
