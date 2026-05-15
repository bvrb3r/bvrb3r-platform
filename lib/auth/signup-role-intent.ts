import type { IdentityLane, Role } from "@/types/domain";

export const SIGNUP_ROLE_INTENT_COOKIE = "bvrb3r-signup-role-intent";
export const SIGNUP_ROLE_INTENT_MAX_AGE_SECONDS = 60 * 30;
export const SIGNUP_ROLE_INTENT_METADATA_KEY = "signup_role_intent";

export type SignupRoleIntent = Exclude<IdentityLane, "platform_admin">;

export const SIGNUP_ROLE_OPTIONS: Array<{
  value: SignupRoleIntent;
  label: string;
  description: string;
}> = [
  {
    value: "client",
    label: "Client",
    description: "Book, rebook, and manage your BVRB3R appointments."
  },
  {
    value: "barber",
    label: "Barber",
    description: "Set up your chair, services, availability, and approval lane."
  },
  {
    value: "shop_owner",
    label: "Shop Owner",
    description: "Create the business lane for your shop and team."
  }
];

const SIGNUP_ROLE_VALUES = new Set<SignupRoleIntent>(SIGNUP_ROLE_OPTIONS.map((option) => option.value));

export function isSignupRoleIntent(value: unknown): value is SignupRoleIntent {
  return typeof value === "string" && SIGNUP_ROLE_VALUES.has(value as SignupRoleIntent);
}

export function getSignupRoleIntentFromMetadata(metadata?: Record<string, unknown> | null) {
  if (!metadata) {
    return null;
  }

  for (const key of [
    SIGNUP_ROLE_INTENT_METADATA_KEY,
    "primary_onboarding_role",
    "pending_onboarding_role"
  ]) {
    const value = metadata[key];
    if (isSignupRoleIntent(value)) {
      return value;
    }
  }

  return null;
}

export function getRuntimeRoleForSignupIntent(role: SignupRoleIntent): Role {
  if (role === "shop_owner") {
    return "owner";
  }

  if (role === "barber") {
    return "barber";
  }

  return "client";
}
