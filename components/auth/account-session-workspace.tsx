import { RotateCcw, ShieldCheck, UserRound } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { Card } from "@/components/ui/card";
import { getDefaultRouteForUser, getUserRoleLabel } from "@/lib/auth/demo-auth";
import type { UserAccount } from "@/types/domain";

function getResumeCopy(user: UserAccount) {
  switch (user.primaryOnboardingRole) {
    case "client":
      return "Future logins resume the client dashboard from this saved account role.";
    case "barber":
      return "Future logins resume the barber dashboard. Barber subtype stays editable inside the dashboard setup/settings area.";
    case "shop_owner":
      return "Future logins resume the owner dashboard with the saved shop identity and real shop data.";
    default:
      return "This account has not selected a primary lane yet. Once selected, BVRB3R will resume that lane on every login.";
  }
}

export function AccountSessionWorkspace({ user }: { user: UserAccount }) {
  const roleLabel = getUserRoleLabel(user);
  const resumePath = getDefaultRouteForUser(user);

  return (
    <Card className="rounded-[32px] border border-[#c4f24e]/16 bg-[linear-gradient(135deg,rgba(196, 242, 78,0.10),rgba(8,8,8,0.98))] p-6" data-testid="account-session-workspace">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="surface-label text-[#e4f9b8]">Account session</p>
          <h3 className="mt-3 text-3xl font-semibold sm:text-4xl" data-display="true">Sign out safely, resume cleanly.</h3>
          <p className="mt-4 text-sm leading-7 text-white/64">
            Logout clears the active Supabase session and client cache. Your role, profile, shop, barber, client, and setup data stay saved canonically in Supabase.
          </p>
        </div>
        <div className="w-full rounded-[26px] border border-white/8 bg-black/25 p-4 lg:max-w-sm">
          <LogoutButton />
          <p className="mt-3 text-xs leading-5 text-white/48">
            After logout, protected dashboards require a fresh authenticated session.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-[24px] border border-white/8 bg-black/22 p-4">
          <div className="inline-flex items-center gap-2 text-sm text-white/78">
            <UserRound className="h-4 w-4 text-[#d9f985]" />
            Signed in as
          </div>
          <p className="mt-3 text-lg font-semibold text-white">{user.name}</p>
          <p className="mt-2 text-sm text-white/58">{user.email}</p>
        </div>
        <div className="rounded-[24px] border border-white/8 bg-black/22 p-4">
          <div className="inline-flex items-center gap-2 text-sm text-white/78">
            <ShieldCheck className="h-4 w-4 text-[#e4f9b8]" />
            Saved lane
          </div>
          <p className="mt-3 text-lg font-semibold text-white">{roleLabel}</p>
          <p className="mt-2 text-sm text-white/58">
            Canonical field: {user.primaryOnboardingRole ?? "not selected"}
          </p>
        </div>
        <div className="rounded-[24px] border border-white/8 bg-black/22 p-4">
          <div className="inline-flex items-center gap-2 text-sm text-white/78">
            <RotateCcw className="h-4 w-4 text-[#d9f985]" />
            Resume target
          </div>
          <p className="mt-3 text-lg font-semibold text-white">{resumePath}</p>
          <p className="mt-2 text-sm text-white/58">{getResumeCopy(user)}</p>
        </div>
      </div>
    </Card>
  );
}
