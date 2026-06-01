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
      { label: "Posts", value: 0, helper: "Culture posts" }
    ],
    readiness: {
      title: "Profile readiness",
      subtitle: "Culture-facing identity",
      description: "Keep your public Culture profile clean, real, and recognizable.",
      cards: [
        { title: "Public photo", value: "Setup", helper: "Add a recognizable Culture profile photo.", severity: "warning" },
        { title: "Username", value: handle ? "Ready" : "Set up", helper: "A stable social handle keeps your profile shareable.", severity: handle ? "good" : "warning" },
        { title: "Bio", value: "Setup", helper: "Share a short public story for Culture interactions.", severity: "warning" },
        { title: "Posts", value: 0, helper: "No Culture posts are published yet.", severity: "neutral" },
        { title: "Social visibility", value: "Culture", helper: "Visible only in Culture and social contexts.", severity: "good" }
      ],
      needsAttention: ["Add a public profile photo", "Add a short Culture bio", "Add real public media when posting is available"]
    },
    identity: {
      title: "Public identity",
      subtitle: "What the community sees",
      description: "Your public photo, username, bio, and Culture posts appear across social interactions.",
      cards: [
        { title: "Public photo", value: "Setup", helper: "This image follows comments, likes, follows, and messages." },
        { title: "Bio", value: "Setup", helper: "A short public story helps people recognize you." },
        { title: "Culture posts", value: 0, helper: "Only real Culture posts will appear here." },
        { title: "Social proof", value: "Not connected", helper: "Followers and follows appear when the social layer has activity." }
      ]
    },
    media: {
      title: "Culture posts and profile media",
      subtitle: "Upload real photos or videos that represent your BVRB3R Culture profile.",
      addButtonLabel: "Add post",
      emptyCopy: "No Culture posts yet. Upload controls will activate when Culture publishing is connected; no fake media is shown.",
      items: []
    },
    preview: {
      title: "Client Culture preview",
      subtitle: "This is what other users see.",
      enabled: true,
      actions: ["Follow", "Message", "Share"]
    }
  };
}
