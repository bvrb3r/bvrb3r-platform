import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Terms of Service | BVRB3R",
  description: "Terms governing use of the BVRB3R platform."
};

const EFFECTIVE_DATE = "July 10, 2026";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-black px-5 py-10 text-neutral-100 sm:px-8">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3 border-b border-white/10 pb-8">
          <Link href="/" className="text-sm font-semibold tracking-[0.28em] text-white">BVRB3R</Link>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Terms of Service</h1>
          <p className="text-sm text-neutral-400">Effective {EFFECTIVE_DATE}</p>
        </header>

        <section className="space-y-4 text-sm leading-7 text-neutral-300">
          <p>
            These Terms of Service govern access to and use of BVRB3R websites, applications,
            booking tools, marketplace features, payment features, messaging, Culture, kiosk,
            barber tools, shop-owner tools, and related services.
          </p>
          <p>
            By creating an account, accepting these Terms, or using a BVRB3R service, you agree
            to these Terms and the Privacy Policy. Do not use BVRB3R if you do not agree.
          </p>
        </section>

        <LegalSection title="1. Platform role">
          BVRB3R provides technology that helps clients discover and book services, helps barbers
          operate their chair business, and helps shop owners manage shop operations. Unless a
          service is expressly identified as being provided by BVRB3R, grooming services are
          provided by independent barbers or shops, not by BVRB3R.
        </LegalSection>

        <LegalSection title="2. Accounts and eligibility">
          You must provide accurate information, protect your credentials, and use only authority
          assigned to your account. Client, Barber, and Shop Owner permissions are separate.
          Professional and business users are responsible for licenses, registrations, insurance,
          taxes, and legal requirements applicable to their services.
        </LegalSection>

        <LegalSection title="3. Bookings and service policies">
          Prices, durations, deposits, cancellation rules, lateness rules, no-show rules, refund
          terms, and shop policies must be shown before confirmation when applicable. A booking is
          confirmed only when the platform displays confirmed status from server and payment truth.
          Barbers and shops remain responsible for performing services safely and professionally.
        </LegalSection>

        <LegalSection title="4. Payments, refunds, disputes, and payouts">
          Payments may be processed by Stripe, Square, or another disclosed provider. Processor,
          server, and database records control payment status. Payout eligibility may require a
          completed service, successful payment, valid routing, identity or tax verification, and no
          active refund, dispute, or compliance hold. Refunds and disputes are handled under the
          applicable booking policy, processor rules, and law.
        </LegalSection>

        <LegalSection title="5. Barber and shop-owner responsibilities">
          Barbers and shop owners must keep profiles, services, pricing, availability, team
          relationships, compensation rules, policies, and payout information accurate. They may
          not misrepresent credentials, manipulate bookings or reviews, bypass platform payment
          rules, misuse client data, or access information outside their authorized scope.
        </LegalSection>

        <LegalSection title="6. Culture, reviews, and messaging">
          Content must be lawful, authentic, respectful, and appropriate for the BVRB3R community.
          Reviews should reflect real experiences and may be limited to verified completed
          appointments. Spam, harassment, impersonation, fraudulent reviews, intellectual-property
          violations, and unsafe content are prohibited. BVRB3R may moderate, restrict, preserve,
          or remove content consistent with law and platform policy.
        </LegalSection>

        <LegalSection title="7. Prohibited conduct">
          You may not compromise security; bypass permissions; scrape protected data; introduce
          malicious code; abuse payment, referral, loyalty, kiosk, messaging, or review systems;
          use BVRB3R for illegal discrimination or unlawful services; or interfere with another
          person’s use of the platform.
        </LegalSection>

        <LegalSection title="8. Subscriptions and digital features">
          Free, Pro, and Elite are feature-access tiers, not account roles. Paid access starts only
          after confirmed billing and entitlement truth. Billing interval, renewal, cancellation,
          and refund information will be shown at purchase. Native-app purchases may also be
          governed by Apple or Google billing terms where required.
        </LegalSection>

        <LegalSection title="9. Suspension and termination">
          BVRB3R may restrict or suspend access to protect users, money, platform integrity, or legal
          compliance. You may stop using the platform and request account deletion, subject to
          retention required for payments, disputes, fraud prevention, safety, taxes, audit, or law.
        </LegalSection>

        <LegalSection title="10. Disclaimers and limitation">
          BVRB3R is provided on an “as available” basis to the extent permitted by law. BVRB3R does
          not guarantee a particular barber, service result, uninterrupted availability, income,
          ranking, or payout timing controlled by external processors or banks. Nothing in these
          Terms excludes rights or liability that cannot lawfully be excluded.
        </LegalSection>

        <LegalSection title="11. Changes and contact">
          Material updates will be versioned and presented for acceptance when required. Questions,
          legal notices, and support requests may be submitted through the in-app Support channel.
        </LegalSection>

        <footer className="border-t border-white/10 pt-6 text-sm text-neutral-400">
          <Link href="/privacy" className="underline underline-offset-4">Privacy Policy</Link>
        </footer>
      </article>
    </main>
  );
}

function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="text-sm leading-7 text-neutral-300">{children}</div>
    </section>
  );
}
