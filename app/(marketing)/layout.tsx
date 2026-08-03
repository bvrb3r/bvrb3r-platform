import { redirect } from "next/navigation";
import { AuthSessionRecovery } from "@/components/auth/auth-session-recovery";
import { PublicFooter } from "@/components/public-site/public-footer";
import { PublicNav } from "@/components/public-site/public-nav";
import styles from "@/components/public-site/public-site.module.css";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { resolvePostAuthDestination } from "@/lib/onboarding/service";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentUserFromServer();
  if (session.mode === "supabase" && session.authenticated) {
    redirect(await resolvePostAuthDestination(session.user));
  }

  return (
    <div className={styles.marketingPage} data-public-site>
      <AuthSessionRecovery mode="public" />
      <PublicNav />
      <main className="pt-24 sm:pt-28">{children}</main>
      <PublicFooter />
    </div>
  );
}
