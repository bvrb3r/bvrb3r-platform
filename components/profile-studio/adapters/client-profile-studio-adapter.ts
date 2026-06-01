import type { ProfileStudioViewModel } from "@/components/profile-studio/profile-studio-shell";
import type { UserAccount } from "@/types/domain";

function suggestHandle(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 32);
}

export function buildClientProfileStudioViewModel(user: UserAccount): ProfileStudioViewModel {
  const displayName = user.canonicalFullName ?? user.name ?? "Client";
  const handle = suggestHandle(displayName) || "client";
  const userWithLocation = user as UserAccount & { city?: string | null; state?: string | null };
  const city = typeof userWithLocation.city === "string" ? userWithLocation.city : "";
  const state = typeof userWithLocation.state === "string" ? userWithLocation.state : "";
  const location = [city, state].filter(Boolean).join(", ");

  return {
    role: "client",
    page: {
      title: "Public Profile",
      subtitle: "Manage your Culture profile",
      statusText: "Client public profiles appear in Culture and social interactions. They do not appear in barber or shop marketplace search."
    },
    hero: {
      label: "Culture profile",
      title: "Public Profile",
      subtitle: "Shape the identity that appears in Culture, comments, likes, follows, and message context.",
      publicName: displayName,
      username: handle,
      publicUrl: `/client/${handle}`,
      badge: "Culture profile",
      bio: "",
      contextLine: location || "Culture and social identity",
      emptyTitle: "Finish profile",
      emptyBody: "Add your photo, username, bio, and public media."
    },
    actions: {
      publicPreviewLabel: "Public preview",
      editProfileLabel: "Edit profile",
      mediaLabel: "Posts",
      shareLabel: "Share profile"
    },
    username: {
      title: "Public username",
      value: handle,
      helperText: "Lowercase letters, numbers, hyphens, or underscores. If you leave it alone, BVRB3R keeps a stable fallback link.",
      canEdit: true,
      publicUrl: `/client/${handle}`
    },
    stats: [
      { label: "Posts", value: 0 },
      { label: "Followers", value: 0 },
      { label: "Following", value: 0 }
    ],
    trustCards: [
      { title: "Culture activity", value: "0 Posts", helper: "Shared in Culture", status: "neutral" },
      { title: "Social profile", value: "0 Followers", helper: "Community proof builds here", status: "neutral" },
      { title: "Member status", value: "Active", helper: "BVRB3R Culture", status: "good" }
    ],
    dashboardSummary: {
      title: "Your dashboard",
      text: "0 profile views, 0 post clicks."
    },
    secondaryActions: [
      { label: "Edit profile", intent: "edit_profile" },
      { label: "Share profile", intent: "share_profile" }
    ],
    highlights: [
      { label: "New", type: "new" },
      { label: "Culture", type: "collection" }
    ],
    work: {
      title: "Your posts",
      countLabel: "0 posts",
      manageLabel: "Manage",
      emptyCopy: "No Culture posts yet. Add real media when Culture publishing is connected.",
      items: []
    }
  };
}
