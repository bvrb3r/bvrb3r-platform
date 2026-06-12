import { CultureComposerScreen } from "@/components/culture/culture-composer-screen";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { OWNER_PRIMARY_TAB_HREFS } from "@/components/owner-experience/owner-tab-config";
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

export default async function OwnerCultureComposerPage() {
  const user = await getAuthorizedUser(["shop_owner_user"]);
  const access = await resolveCultureComposerAccess(user, "owner").catch((error) => ({
    role: "owner" as const,
    actorRole: "shop_owner_user" as const,
    authorProfileId: user.id,
    barberId: null,
    shopId: null,
    canCompose: false,
    blockedReason: error instanceof Error ? error.message : "Culture posting is not available."
  }));
  const posts = access.canCompose
    ? await listMyCulturePosts(user, "owner").catch(() => emptyPosts)
    : emptyPosts;

  return (
    <DashboardShell
      user={user}
      activeHref={OWNER_PRIMARY_TAB_HREFS.home}
      title="Create Culture Post"
      subtitle="Create a Shop Culture post."
      hidePageHeader
      hideShellContext
    >
      <CultureComposerScreen
        role="owner"
        postTypeOptions={getCultureComposerPostTypeOptions("owner")}
        initialPosts={posts}
        blockedReason={access.blockedReason}
      />
    </DashboardShell>
  );
}
