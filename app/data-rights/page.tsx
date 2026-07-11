import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

export const metadata: Metadata = {
  title: "Data Rights | BVRB3R",
  description: "How BVRB3R users can access, export, correct, restrict, or request deletion of account data."
};

const document = LEGAL_DOCUMENTS.dataRights;

export default function DataRightsPage() {
  return (
    <main className="min-h-screen bg-black px-5 py-10 text-neutral-100 sm:px-8">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3 border-b border-white/10 pb-8">
          <Link href="/" className="text-sm font-semibold tracking-[0.28em] text-white">BVRB3R</Link>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Data Rights</h1>
          <p className="text-sm text-neutral-400">Version {document.version} · Effective {document.effectiveDate}</p>
        </header>

        <Section title="Your available controls">
          Authenticated users can request a portable account export, correct supported account details, update privacy preferences, and submit an account-deletion request. Available rights can vary by location and may be subject to identity verification and lawful exceptions.
        </Section>
        <Section title="Account export">
          The authenticated export endpoint compiles the requesting user&apos;s profile and role-linked records from canonical BVRB3R systems. Exports do not include another person&apos;s private information, internal security material, payment credentials, or data BVRB3R is not legally permitted to disclose.
        </Section>
        <Section title="Account deletion">
          Deletion begins as a verified request, not an unsafe immediate database wipe. BVRB3R may first restrict processing, preserve required evidence, resolve active bookings, payments, refunds, disputes, payouts, fraud, safety, tax, audit, or legal-hold obligations, and then delete or de-identify eligible information.
        </Section>
        <Section title="Retention and legal holds">
          Some records may remain for the period reasonably necessary to meet payment, accounting, tax, dispute, fraud-prevention, safety, contractual, regulatory, or legal obligations. Retained records remain access-controlled and are not kept merely because deletion is inconvenient.
        </Section>
        <Section title="Identity verification and request status">
          Data-rights actions require an authenticated account. BVRB3R records the request, type, status, and timestamps so the user and Architect can verify whether it is pending, processing, blocked for a stated reason, completed, or denied under an applicable exception.
        </Section>
        <Section title="How to use these rights">
          Sign in and use the Privacy or Data Rights controls in More. For a request that cannot be completed through the app, use the in-app Support channel and identify the account and request type. Never send passwords, full card numbers, or raw government identifiers through ordinary messages.
        </Section>

        <footer className="flex flex-wrap gap-4 border-t border-white/10 pt-6 text-sm text-neutral-400">
          <Link href="/privacy" className="underline underline-offset-4">Privacy Policy</Link>
          <Link href="/terms" className="underline underline-offset-4">Terms</Link>
          <Link href="/community-guidelines" className="underline underline-offset-4">Community Guidelines</Link>
        </footer>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="text-sm leading-7 text-neutral-300">{children}</div>
    </section>
  );
}
