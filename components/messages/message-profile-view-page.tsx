import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import {
  cleanPublicClientUsername,
  PublicClientProfileContent,
  readPublicClientProfile
} from "@/components/marketplace/public-client-profile";
import { PublicBarberProfile } from "@/components/marketplace/public-barber-profile";
import { PublicShopProfile } from "@/components/marketplace/public-shop-profile";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { getPublicShopProfilePayload, getBarberDetailsPayload } from "@/lib/booking/platform-service";
import type { UserAccount } from "@/types/domain";

type ViewerSurface = "client" | "barber" | "shop";
type ProfileTargetKind = "client" | "barber" | "shop";

const viewerConfig = {
  client: {
    roles: ["client_user"],
    messagesHref: "/dashboard/client/messages",
    shellTitle: "Messages",
    shellSubtitle: "Your conversations, appointments, and support."
  },
  barber: {
    roles: ["barber_user"],
    messagesHref: "/dashboard/barber/messages",
    shellTitle: "Messages",
    shellSubtitle: "Clients, bookings, shop lines, and support."
  },
  shop: {
    roles: ["shop_owner_user"],
    messagesHref: "/dashboard/owner/messages",
    shellTitle: "Messages",
    shellSubtitle: "Clients, barbers, team, bookings, and support."
  }
} as const;

function cleanTargetKind(value: string): ProfileTargetKind | null {
  return value === "client" || value === "barber" || value === "shop" ? value : null;
}

function buildBackHref(surface: ViewerSurface, sourceThreadId?: string | string[]) {
  const config = viewerConfig[surface];
  const threadId = Array.isArray(sourceThreadId) ? sourceThreadId[0] : sourceThreadId;
  return threadId
    ? `${config.messagesHref}/${encodeURIComponent(threadId)}`
    : config.messagesHref;
}

function ProfileBackLink({ href }: { href: string }) {
  return (
    <Link href={href as Route} className="mb-4 inline-flex text-xs font-black uppercase tracking-[0.18em] text-[#c4f24e]">
      Back to Messages
    </Link>
  );
}

async function ProfileTargetContent({
  targetKind,
  target,
  backHref
}: {
  targetKind: ProfileTargetKind;
  target: string;
  backHref: string;
}) {
  if (targetKind === "client") {
    const username = cleanPublicClientUsername(target) || "client";
    const profile = await readPublicClientProfile(username);
    return (
      <PublicClientProfileContent
        profile={profile}
        username={username}
        backHref={backHref}
        backLabel="Back to Messages"
      />
    );
  }

  if (targetKind === "barber") {
    const profile = await getBarberDetailsPayload(target);
    if (!profile) {
      notFound();
    }

    return (
      <div className="space-y-4">
        <ProfileBackLink href={backHref} />
        <PublicBarberProfile
          profile={profile}
          viewerCanFollow
          viewerCanMessage
          viewerCanReview={false}
        />
      </div>
    );
  }

  const payload = await getPublicShopProfilePayload(target);
  if (!payload) {
    notFound();
  }

  return (
    <div className="space-y-4">
      <ProfileBackLink href={backHref} />
      <PublicShopProfile payload={payload} viewerCanFavorite={false} />
    </div>
  );
}

function renderShell(surface: ViewerSurface, user: UserAccount | null, children: React.ReactNode) {
  const config = viewerConfig[surface];

  if (surface === "client") {
    return <ClientAppShell activeTab="messages">{children}</ClientAppShell>;
  }

  if (!user) {
    return children;
  }

  return (
    <DashboardShell
      user={user}
      activeHref={config.messagesHref}
      title={config.shellTitle}
      subtitle={config.shellSubtitle}
      hidePageHeader
      hideShellContext={surface === "shop"}
    >
      {children}
    </DashboardShell>
  );
}

export async function MessageProfileViewPage({
  surface,
  params,
  searchParams
}: {
  surface: ViewerSurface;
  params: Promise<{ targetKind: string; target: string }>;
  searchParams?: Promise<{ sourceThreadId?: string | string[] }>;
}) {
  const config = viewerConfig[surface];
  const user = surface === "client"
    ? (await getAuthorizedUser([...config.roles])) as UserAccount
    : await getAuthorizedUser([...config.roles]);
  const [{ targetKind: rawTargetKind, target: rawTarget }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { sourceThreadId?: string | string[] })
  ]);
  const targetKind = cleanTargetKind(rawTargetKind);
  if (!targetKind) {
    notFound();
  }

  const target = decodeURIComponent(rawTarget).trim();
  const backHref = buildBackHref(surface, resolvedSearchParams.sourceThreadId);
  const content = await ProfileTargetContent({ targetKind, target, backHref });

  return renderShell(surface, user, content);
}
