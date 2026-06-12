import { CultureComposerScreen } from "@/components/culture/culture-composer-screen";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getAuthorizedUser } from "@/lib/auth/guards";
import {
  getCultureComposerPostTypeOptions,
  listMyCulturePosts,
  resolveCultureComposerAccess,
  type CultureMyPosts
} from "@/lib/culture/service";

const emptyPosts: CultureMyPosts = {
  drafts: [],
  pendingReview: [],
  published: [],
  archived: []
};

export default async function BarberCultureComposerPage() {
  const user = await getAuthorizedUser(["barber_user"]);
  const access = await resolveCultureComposerAccess(user, "barber").catch((error) => ({
    role: "barber" as const,
    actorRole: "barber_user" as const,
    authorProfileId: user.id,
    barberId: null,
    shopId: null,
    canCompose: false,
    blockedReason: error instanceof Error ? error.message : "Culture posting is not available."
  }));
  const posts = access.canCompose
    ? await listMyCulturePosts(user, "barber").catch(() => emptyPosts)
    : emptyPosts;

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/barber/messages"
      title="Create Culture Post"
      subtitle="Create a Barber Culture post."
      hidePageHeader
    >
      <CultureComposerScreen
        role="barber"
        postTypeOptions={getCultureComposerPostTypeOptions("barber")}
        initialPosts={posts}
        blockedReason={access.blockedReason}
      />
    </DashboardShell>
  );
}
