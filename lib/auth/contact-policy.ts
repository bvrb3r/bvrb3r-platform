export const CONTACT_VERIFICATION_POLICY = {
  requireVerifiedEmail: true,
  requireVerifiedPhone: true
} as const;

export function isCanonicalContactComplete(input: {
  hasRequiredContactFields: boolean;
  emailVerified?: boolean | null;
  phoneVerified?: boolean | null;
}) {
  return Boolean(
    input.hasRequiredContactFields
    && (!CONTACT_VERIFICATION_POLICY.requireVerifiedEmail || input.emailVerified)
    && (!CONTACT_VERIFICATION_POLICY.requireVerifiedPhone || input.phoneVerified)
  );
}
