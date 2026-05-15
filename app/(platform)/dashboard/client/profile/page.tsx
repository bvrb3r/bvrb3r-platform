import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { ClientProfileScreen } from "@/components/client-experience/client-profile-screen";
import { StripeDebugCard } from "@/components/debug/stripe-debug-card";
import { ensureClientProfileForUser, getClientProfilePayload } from "@/lib/booking/platform-service";
import { isClientRole } from "@/lib/auth/roles";
import { getClientExperienceContext } from "@/lib/client-experience/session";

export default async function ClientProfileDashboardPage({
  searchParams
}: {
  searchParams: Promise<{ section?: string; stripeMinimalTest?: string }>;
}) {
  const context = await getClientExperienceContext();
  const params = await searchParams;
  if (params.stripeMinimalTest === "1") {
    return (
      <ClientAppShell activeTab="profile">
        <StripeDebugCard />
      </ClientAppShell>
    );
  }

  let clientId = context.clientId;
  if (context.isSignedInClient && isClientRole(context.viewer.role)) {
    const repair = await ensureClientProfileForUser({
      userId: context.viewer.id,
      clientId: context.clientId || undefined,
      email: context.viewer.email,
      fullName: context.viewer.canonicalFullName ?? context.viewer.name,
      phone: context.viewer.phone,
      role: context.viewer.role
    });
    clientId = repair.clientId;
  }
  const payload = await getClientProfilePayload(clientId);

  return (
    <ClientAppShell activeTab="profile">
      <ClientProfileScreen
        payload={payload}
        isSignedInClient={context.isSignedInClient}
        initialSection={params.section}
        authEmail={context.viewer.email}
        authPhone={context.viewer.phone}
        emailVerified={context.viewer.emailVerified}
        phoneVerified={context.viewer.phoneVerified}
      />
    </ClientAppShell>
  );
}
