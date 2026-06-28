import { BarberOnboardingWorkspace } from "@/components/onboarding/barber-onboarding-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { cleanBarberUsername, normalizeBarberOnboardingStep } from "@/lib/onboarding/barber-path";

export default async function BarberOnboardingPathPage({
  searchParams
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const user = await getAuthorizedUser(["barber_user"]);
  const params = await searchParams;
  const step = normalizeBarberOnboardingStep(params.step);

  return (
    <BarberOnboardingWorkspace
      step={step}
      initialDraft={{
        authenticated: true,
        role: "barber_user",
        barberRecordId: user.barberId ?? null,
        displayName: user.name,
        publicUsername: user.name ? cleanBarberUsername(user.name) : "",
        usernameAvailable: false,
        email: user.email,
        phone: user.phone ?? null
      }}
    />
  );
}
