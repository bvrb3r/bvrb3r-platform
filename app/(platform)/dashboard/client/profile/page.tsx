import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { ClientProfileScreen } from "@/components/client-experience/client-profile-screen";
import { StripeDebugCard } from "@/components/debug/stripe-debug-card";
import { ensureClientProfileForUser, getClientProfilePayload, type ClientProfilePayload } from "@/lib/booking/platform-service";
import { isClientRole } from "@/lib/auth/roles";
import { getClientExperienceContext } from "@/lib/client-experience/session";
import { resolveClientPaywallSummaryForUser } from "@/lib/entitlements/client-paywall";

function emptyClientProfilePayload(): ClientProfilePayload {
  return {
    client: null,
    favoriteBarber: null,
    preferredShops: [],
    notificationPreference: null,
    routine: null,
    paymentMethods: []
  };
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default async function ClientProfileDashboardPage({
  searchParams
}: {
  searchParams: Promise<{ section?: string; stripeMinimalTest?: string }>;
}) {
  const context = await getClientExperienceContext();
  const params = await searchParams;
  if (params.stripeMinimalTest === "1") {
    return (
      <ClientAppShell activeTab="more">
        <StripeDebugCard />
      </ClientAppShell>
    );
  }

  let clientId = context.clientId;
  if (context.isSignedInClient && isClientRole(context.viewer.role)) {
    try {
      const repair = await ensureClientProfileForUser({
        userId: context.viewer.id,
        clientId: context.clientId || undefined,
        email: context.viewer.email,
        fullName: context.viewer.canonicalFullName ?? context.viewer.name,
        phone: context.viewer.phone,
        role: context.viewer.role
      });
      clientId = repair.clientId;
    } catch (error) {
      console.warn("[client-profile] repair_failed_nonfatal", {
        stage: "ensure_client_profile",
        profileIdPresent: Boolean(context.viewer.id),
        clientIdPresent: Boolean(context.clientId),
        role: context.viewer.role,
        message: safeErrorMessage(error)
      });
    }
  } else if (context.isSignedInClient) {
    console.warn("[client-profile] repair_skipped", {
      stage: "role_guard",
      profileIdPresent: Boolean(context.viewer.id),
      clientIdPresent: Boolean(context.clientId),
      role: context.viewer.role
    });
  } else {
    console.warn("[client-profile] repair_skipped", {
      stage: "not_signed_in_client",
      profileIdPresent: Boolean(context.viewer.id),
      clientIdPresent: Boolean(context.clientId),
      role: context.viewer.role
    });
  }

  let payload: ClientProfilePayload;
  const paywallSummary = context.isSignedInClient && isClientRole(context.viewer.role)
    ? await resolveClientPaywallSummaryForUser({ user: context.viewer })
    : undefined;

  try {
    payload = await getClientProfilePayload(clientId);
  } catch (error) {
    console.warn("[client-profile] repair_failed_nonfatal", {
      stage: "profile_payload",
      profileIdPresent: Boolean(context.viewer.id),
      clientIdPresent: Boolean(clientId),
      role: context.viewer.role,
      message: safeErrorMessage(error)
    });
    payload = emptyClientProfilePayload();
  }

  return (
    <ClientAppShell activeTab="more">
      <ClientProfileScreen
        payload={payload}
        isSignedInClient={context.isSignedInClient}
        initialSection={params.section}
        authEmail={context.viewer.email}
        authPhone={context.viewer.phone}
        emailVerified={context.viewer.emailVerified}
        phoneVerified={context.viewer.phoneVerified}
        paywallSummary={paywallSummary}
      />
    </ClientAppShell>
  );
}
