import type { Metadata } from "next";
import Link from "next/link";
import { BillingWorkspace } from "@/components/billing/billing-workspace";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { Pr34BillingServiceError, readPr34BillingWorkspace } from "@/lib/billing/pr34-service";

export const metadata: Metadata = {
  title: "Subscription & Billing | BVRB3R",
  description: "Manage BVRB3R Standard, Pro, and Elite plans through verified Stripe Billing truth."
};

export const dynamic = "force-dynamic";

function BillingUnavailable({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#060708] p-6 text-[#F5F1E8]">
      <section className="w-full max-w-xl rounded-[26px] border border-amber-300/24 bg-amber-300/[0.055] p-7 text-center">
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-amber-100">Billing needs review</p>
        <h1 className="mt-4 font-serif text-4xl">No plan state was guessed<span className="text-[#C4F24E]">.</span></h1>
        <p className="mt-4 text-sm leading-7 text-white/56">{message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/login" className="inline-flex min-h-11 items-center rounded-full bg-[#C4F24E] px-5 text-sm font-extrabold text-black">Sign in</Link>
          <a href="mailto:support@bvrb3r.app" className="inline-flex min-h-11 items-center rounded-full border border-white/14 px-5 text-sm font-bold text-white/68">Contact support</a>
        </div>
      </section>
    </main>
  );
}

export default async function BillingPage() {
  const session = await getCurrentUserFromServer();
  if (!session.authenticated || session.user.id === "guest-user") {
    return <BillingUnavailable message="Sign in with a Client, Barber, or Shop Owner account to read server-owned billing and balance truth." />;
  }

  try {
    const billing = await readPr34BillingWorkspace({ user: session.user });
    return <BillingWorkspace initial={billing} />;
  } catch (error) {
    const message = error instanceof Pr34BillingServiceError
      ? error.message
      : "Billing could not verify the account right now. Risk actions remain closed.";
    return <BillingUnavailable message={message} />;
  }
}
