import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GlobalSafetyState } from "@/components/ui/global-safety-state";
import { getDefaultRouteForUser } from "@/lib/auth/demo-auth";
import { getCurrentUserFromServer } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Access Denied | BVRB3R",
  description: "Return safely to the BVRB3R home for your account."
};

export const dynamic = "force-dynamic";

export default async function AccessDeniedPage() {
  const session = await getCurrentUserFromServer();
  if (session.authenticated === false || session.user.id === "guest-user") {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#060708] p-6 text-[#F5F1E8]">
      <div className="w-full max-w-xl">
        <GlobalSafetyState
          state="access_denied"
          actionHref={getDefaultRouteForUser(session.user)}
        />
      </div>
    </main>
  );
}
