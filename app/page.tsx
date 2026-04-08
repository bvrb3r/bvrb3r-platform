import { redirect } from "next/navigation";
import { HeroSection } from "@/components/marketing/hero-section";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { AuthSessionRecovery } from "@/components/auth/auth-session-recovery";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { resolvePostAuthDestination } from "@/lib/onboarding/service";
import Link from "next/link";

export default async function HomePage() {
  const session = await getCurrentUserFromServer();
  if (session.mode === "supabase" && session.authenticated) {
    redirect(await resolvePostAuthDestination(session.user));
  }

  return (
    <main>
      <AuthSessionRecovery mode="public" />
      <header className="page-shell safe-top-pad pt-4">
        <div className="flex flex-col gap-4 rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,14,14,0.94),rgba(8,8,8,0.94))] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="surface-label text-[#cfff93]">The BVRB3R Shop(TM) & Co.</p>
            <p className="mt-2 text-2xl font-semibold" data-display="true">BVRB3R Platform</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-white/60">
            <Link href="/features" className="rounded-full px-3 py-2 hover:bg-white/5 hover:text-white">Features</Link>
            <Link href="/pricing" className="rounded-full px-3 py-2 hover:bg-white/5 hover:text-white">Pricing</Link>
            <Link href="/contact" className="rounded-full px-3 py-2 hover:bg-white/5 hover:text-white">Contact</Link>
            <Link href="/login"><Button variant="secondary">Login</Button></Link>
          </div>
        </div>
      </header>
      <HeroSection />
      <FeatureGrid />
      <section className="page-shell py-10 lg:py-16">
        <Card className="grid gap-5 rounded-[38px] bg-[linear-gradient(135deg,rgba(22,22,22,0.98),rgba(8,8,8,0.98))] p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:p-10">
          <div>
            <p className="surface-label text-[#d3ffa0]">Built for expansion</p>
            <h2 className="mt-4 max-w-4xl text-balance text-3xl font-semibold sm:text-5xl" data-display="true">Barbershop-first now. School, franchise, bus, and branded commerce next.</h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/65">The MVP ships with a sharper visual identity and future-ready modules, so BVRB3R can grow without settling for generic software aesthetics or generic workflows.</p>
          </div>
          <Link href="/booking/new"><Button className="h-14 px-7">Try booking flow</Button></Link>
        </Card>
      </section>
    </main>
  );
}



