import type { Metadata } from "next";
import Link from "next/link";
import { BalanceLockWorkspace } from "@/components/billing/balance-lock-workspace";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { Pr34BillingServiceError, readPr34BillingWorkspace } from "@/lib/billing/pr34-service";

export const metadata: Metadata = {
  title: "Balance Lock | BVRB3R",
  description: "Review an itemized BVRB3R balance, dispute a line, or pay in full through Stripe."
};

export const dynamic = "force-dynamic";

type LockedPageProps = {
  searchParams?: Promise<{ balance_attempt?: string | string[] }>;
};

export default async function LockedPage({ searchParams }: LockedPageProps) {
  const session = await getCurrentUserFromServer();
  if (!session.authenticated || session.user.id === "guest-user") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#060708] p-6 text-[#F5F1E8]">
        <section className="w-full max-w-xl rounded-[26px] border border-white/10 bg-white/[0.025] p-7 text-center">
          <h1 className="font-serif text-4xl">Sign in to review your balance<span className="text-[#C4F24E]">.</span></h1>
          <p className="mt-4 text-sm leading-7 text-white/56">Balance lines are private and always resolved from the authenticated account.</p>
          <Link href="/login" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-[#C4F24E] px-6 text-sm font-extrabold text-black">Sign in</Link>
        </section>
      </main>
    );
  }

  try {
    const [billing, params] = await Promise.all([
      readPr34BillingWorkspace({ user: session.user, includeStripeInvoices: false }),
      searchParams ?? Promise.resolve({} as { balance_attempt?: string | string[] })
    ]);
    const rawAttempt = Array.isArray(params.balance_attempt) ? params.balance_attempt[0] : params.balance_attempt;
    const resumeAttemptId = rawAttempt && /^[0-9a-f-]{36}$/i.test(rawAttempt) ? rawAttempt : null;
    return <BalanceLockWorkspace initial={billing} resumeAttemptId={resumeAttemptId} />;
  } catch (error) {
    const message = error instanceof Pr34BillingServiceError
      ? error.message
      : "The server could not verify balance truth. No amount was invented.";
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#060708] p-6 text-[#F5F1E8]">
        <section className="w-full max-w-xl rounded-[26px] border border-amber-300/24 bg-amber-300/[0.055] p-7 text-center">
          <h1 className="font-serif text-4xl">Balance needs review<span className="text-[#C4F24E]">.</span></h1>
          <p className="mt-4 text-sm leading-7 text-white/56">{message}</p>
          <a href="mailto:support@bvrb3r.app" className="mt-6 inline-flex min-h-11 items-center rounded-full border border-amber-300/28 px-6 text-sm font-bold text-amber-100">Contact support</a>
        </section>
      </main>
    );
  }
}
