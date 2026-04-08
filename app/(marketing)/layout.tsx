import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthSessionRecovery } from "@/components/auth/auth-session-recovery";
import { Button } from "@/components/ui/button";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { resolvePostAuthDestination } from "@/lib/onboarding/service";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentUserFromServer();
  if (session.mode === "supabase" && session.authenticated) {
    redirect(await resolvePostAuthDestination(session.user));
  }

  return (
    <main>
      <AuthSessionRecovery mode="public" />
      <header className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-4 rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,14,14,0.94),rgba(8,8,8,0.94))] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Link href="/" className="text-2xl font-semibold" data-display="true">BVRB3R Platform</Link>
          <nav className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-white/60">
            <Link href="/features" className="rounded-full px-3 py-2 hover:bg-white/5 hover:text-white">Features</Link>
            <Link href="/pricing" className="rounded-full px-3 py-2 hover:bg-white/5 hover:text-white">Pricing</Link>
            <Link href="/contact" className="rounded-full px-3 py-2 hover:bg-white/5 hover:text-white">Contact</Link>
            <Link href="/login"><Button variant="secondary">Login</Button></Link>
          </nav>
        </div>
      </header>
      {children}
    </main>
  );
}
