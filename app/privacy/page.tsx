import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Privacy Policy | BVRB3R",
  description: "How BVRB3R collects, uses, protects, and shares information."
};

const EFFECTIVE_DATE = "July 10, 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-black px-5 py-10 text-neutral-100 sm:px-8">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3 border-b border-white/10 pb-8">
          <Link href="/" className="text-sm font-semibold tracking-[0.28em] text-white">BVRB3R</Link>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Privacy Policy</h1>
          <p className="text-sm text-neutral-400">Effective {EFFECTIVE_DATE}</p>
        </header>

        <section className="space-y-4 text-sm leading-7 text-neutral-300">
          <p>
            This Privacy Policy explains how BVRB3R collects, uses, discloses, protects, and
            retains information when people use BVRB3R websites, applications, booking, payments,
            messaging, Culture, kiosk, barber tools, shop-owner tools, and support services.
          </p>
        </section>

        <PrivacySection title="1. Information we collect">
          We may collect account identity, contact and verification information, role and profile
          information, barber or shop credentials, service and availability data, bookings,
          appointment history, payment references, receipts, payout and tax-verification status,
          messages, reviews, Culture content, loyalty and referral activity, device and diagnostic
          information, location choices, consent records, support requests, and security events.
          Payment-card and sensitive identity verification data may be collected directly by Stripe,
          Square, Apple, Google, or another disclosed provider rather than stored by BVRB3R.
        </PrivacySection>

        <PrivacySection title="2. How information is used">
          We use information to authenticate users; provide role-correct experiences; operate
          discovery, booking, payment, payout, kiosk, messaging, reviews, loyalty, referrals, and
          Culture; verify professionals and shops; prevent fraud and abuse; provide support;
          maintain audit and security records; improve reliability; measure platform performance;
          comply with law; and communicate service or marketing messages according to consent.
        </PrivacySection>

        <PrivacySection title="3. Role-based visibility">
          Information is displayed according to role, relationship, and permission. Clients may see
          public barber and shop information. Barbers may see appointment and client information
          needed to perform authorized services. Shop owners may see shop-scoped team, schedule,
          kiosk, and owner-safe financial information. Protected Architect access is limited to
          authorized internal operations and evidence-backed platform control.
        </PrivacySection>

        <PrivacySection title="4. How information is shared">
          Information may be shared with the barber or shop involved in a booking; processors and
          service providers that operate authentication, hosting, payments, communications,
          analytics, security, and support; legal or regulatory authorities when required; and a
          successor in a lawful business transaction. BVRB3R does not sell payment credentials.
          Sponsored or marketing uses will be disclosed and controlled as required by law.
        </PrivacySection>

        <PrivacySection title="5. Location and public profile controls">
          Approximate or precise location may be used for nearby discovery only after permission or
          user entry. Public profile fields may include display name, username, city, portfolio,
          services, availability, reviews, shop affiliation, and public business location. Private
          contact, payout, tax, verification, and internal operational records are not public profile
          fields.
        </PrivacySection>

        <PrivacySection title="6. Messages, reviews, and Culture">
          Messages and user-generated content may be processed for delivery, safety, abuse
          prevention, moderation, support, and legal compliance. Reviews may be linked to completed
          appointments to protect integrity. Public content can be viewed, shared, or indexed
          according to the selected visibility and platform rules.
        </PrivacySection>

        <PrivacySection title="7. Retention">
          Information is kept only as long as reasonably necessary for the service, user choices,
          security, fraud prevention, payment reconciliation, taxes, disputes, audits, legal holds,
          and applicable law. Some records cannot be deleted immediately when they are required to
          preserve financial, safety, contractual, or legal truth.
        </PrivacySection>

        <PrivacySection title="8. Security">
          BVRB3R uses authentication, role checks, row-level security, server validation, encryption
          in transit, provider controls, audit records, monitoring, and restricted internal access.
          No system can guarantee absolute security. Users must protect credentials and report
          suspected unauthorized access promptly.
        </PrivacySection>

        <PrivacySection title="9. Your choices and rights">
          Depending on location, users may request access, correction, deletion, export, restriction,
          or objection; manage notifications and marketing preferences; revoke optional permissions;
          and appeal certain moderation or account decisions. Requests may be made through in-app
          Support. Identity verification may be required before fulfilling a request.
        </PrivacySection>

        <PrivacySection title="10. Children">
          BVRB3R is not intended for independent use by children below the minimum legal age for
          account consent. A parent or legal guardian must control any permitted minor account or
          booking as required by law and platform policy.
        </PrivacySection>

        <PrivacySection title="11. Changes and contact">
          Material changes will be versioned and communicated when required. Privacy questions and
          rights requests may be submitted through the in-app Support channel.
        </PrivacySection>

        <footer className="border-t border-white/10 pt-6 text-sm text-neutral-400">
          <Link href="/terms" className="underline underline-offset-4">Terms of Service</Link>
        </footer>
      </article>
    </main>
  );
}

function PrivacySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="text-sm leading-7 text-neutral-300">{children}</div>
    </section>
  );
}
