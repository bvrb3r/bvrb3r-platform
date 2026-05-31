import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { ClientPublicProfileEditor } from "@/components/client-experience/client-public-profile-editor";
import { isClientRole } from "@/lib/auth/roles";
import { getClientExperienceContext } from "@/lib/client-experience/session";

export default async function ClientPublicProfilePage() {
  const context = await getClientExperienceContext();
  const user = context.viewer;

  if (!isClientRole(user.role)) {
    return (
      <ClientAppShell activeTab="more">
        <div className="rounded-[24px] border border-red-400/25 bg-red-500/10 p-5 text-sm font-bold text-red-100">
          Client public profiles are available for client accounts.
        </div>
      </ClientAppShell>
    );
  }

  return (
    <ClientAppShell activeTab="more">
      <ClientPublicProfileEditor user={user} />
    </ClientAppShell>
  );
}
