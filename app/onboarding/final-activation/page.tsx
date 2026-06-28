import { FinalActivationWorkspace } from "@/components/onboarding/final-activation-workspace";
import { buildFinalActivationFromContext, type FinalActivationRoleScope } from "@/lib/onboarding/final-activation";
import { resolveRoleScope } from "@/lib/onboarding/readiness";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import type { OnboardingReadinessContext, PublicAccountRole } from "@/lib/onboarding/types";
import type { UserAccount } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function OnboardingFinalActivationPage() {
  const session = await getCurrentUserFromServer();
  const targetRole = resolveTargetRole(session.authenticated, session.user);
  const context = buildContext(session.authenticated, session.user, targetRole);
  const result = buildFinalActivationFromContext(targetRole, context);

  return <FinalActivationWorkspace result={result} />;
}

function resolveTargetRole(authenticated: boolean, user: UserAccount): FinalActivationRoleScope {
  if (!authenticated) return "guest";

  const runtimeScope = resolveRoleScope(user.role, authenticated);
  if (runtimeScope === "client" || runtimeScope === "barber" || runtimeScope === "shop_owner") {
    return runtimeScope;
  }

  if (user.primaryOnboardingRole === "client") return "client";
  if (user.primaryOnboardingRole === "barber") return "barber";
  if (user.primaryOnboardingRole === "shop_owner") return "shop_owner";
  if (user.clientId) return "client";
  if (user.barberId) return "barber";
  if (user.ownedShopId) return "shop_owner";

  return "guest";
}

function buildContext(authenticated: boolean, user: UserAccount, targetRole: FinalActivationRoleScope): OnboardingReadinessContext {
  if (!authenticated || targetRole === "guest") {
    return { city: undefined, intent: "join" };
  }

  const publicRole = publicRoleFor(targetRole);
  const name = user.canonicalFullName?.trim() || user.name?.trim() || `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  const username = usernameSeed(user, targetRole);
  const hasContact = Boolean(user.email?.trim() || user.phone?.trim());

  return {
    authenticated: true,
    authMethodConnected: true,
    role: publicRole,
    name,
    username,
    email: hasContact ? user.email : "",
    phone: hasContact ? user.phone : "",
    emailVerified: user.emailVerified === true,
    phoneVerified: user.phoneVerified === true,
    termsAccepted: true,
    trustRulesAccepted: true,
    barberBusiness: targetRole === "barber"
      ? {
          barberRecordId: user.barberId,
          displayName: name,
          username,
          safeProfilePlaceholderAllowed: true
        }
      : undefined,
    shop: targetRole === "shop_owner"
      ? {
          ownerAuthority: Boolean(user.ownedShopId),
          shopRecordId: user.ownedShopId,
          shopName: user.ownedShopName,
          shopUsername: username,
          verificationPosture: user.shopApprovalStatus === "approved" || user.appApprovalStatus === "approved" ? "approved" : "pending"
        }
      : undefined,
    payout: targetRole === "barber" || targetRole === "shop_owner"
      ? {
          providerTruthConnected: false,
          frontendOnly: true,
          providerPayoutStatus: "unknown"
        }
      : undefined
  };
}

function publicRoleFor(targetRole: Exclude<FinalActivationRoleScope, "guest">): PublicAccountRole {
  if (targetRole === "client") return "client_user";
  if (targetRole === "barber") return "barber_user";
  return "shop_owner_user";
}

function usernameSeed(user: UserAccount, targetRole: FinalActivationRoleScope) {
  if (targetRole === "shop_owner") {
    return user.ownedShopName?.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 32) ?? "";
  }

  return user.email?.split("@")[0]?.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 32) ?? "";
}
