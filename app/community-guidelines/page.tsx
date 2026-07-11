import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

export const metadata: Metadata = {
  title: "Community Guidelines | BVRB3R",
  description: "Rules for safe, authentic participation across BVRB3R Culture, reviews, profiles, messages, and marketplace activity."
};

const document = LEGAL_DOCUMENTS.community;

export default function CommunityGuidelinesPage() {
  return (
    <main className="min-h-screen bg-black px-5 py-10 text-neutral-100 sm:px-8">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3 border-b border-white/10 pb-8">
          <Link href="/" className="text-sm font-semibold tracking-[0.28em] text-white">BVRB3R</Link>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Community Guidelines</h1>
          <p className="text-sm text-neutral-400">Version {document.version} · Effective {document.effectiveDate}</p>
        </header>

        <Guideline title="1. Real people and real work">
          Use accurate identity, profile, service, shop, portfolio, booking, and credential information. Do not impersonate another person or business, fabricate appointments, reviews, ratings, followers, or professional qualifications.
        </Guideline>
        <Guideline title="2. Respectful Culture">
          Harassment, threats, hate, targeted abuse, sexual exploitation, doxxing, intimidation, and discriminatory conduct are prohibited. Criticism must address the service or content without attacking protected identity or personal safety.
        </Guideline>
        <Guideline title="3. Authentic reviews and marketplace trust">
          Reviews must reflect genuine experiences. Appointment-verified reviews may receive stronger trust treatment. Review manipulation, retaliation, incentives conditioned on positive ratings, competitor attacks, and duplicate or automated reviews are prohibited.
        </Guideline>
        <Guideline title="4. Safe content and intellectual property">
          Post only content you have the right to share. Do not publish private client information, copyrighted work without permission, graphic violence, illegal services, malicious links, or content that endangers a client, barber, shop, or community member.
        </Guideline>
        <Guideline title="5. Messaging and consent">
          Messages must support legitimate booking, service, support, rebooking, shop, or community workflows. Spam, deceptive promotion, repeated unwanted contact, and marketing outreach without required consent are prohibited. Opt-out requests must be honored.
        </Guideline>
        <Guideline title="6. Payments, referrals, loyalty, and kiosk integrity">
          Do not bypass platform rules, manipulate fees, create fake referrals, abuse rewards, submit fraudulent disputes, interfere with walk-in rotation, expose kiosk data, or use another person&apos;s payment or account information without authority.
        </Guideline>
        <Guideline title="7. Reporting, moderation, and appeals">
          BVRB3R may limit visibility, remove content, restrict actions, preserve evidence, suspend access, or refer matters to providers or authorities when reasonably necessary for safety, legal compliance, fraud prevention, or platform integrity. Users may use Support to request review of a moderation decision.
        </Guideline>

        <footer className="flex flex-wrap gap-4 border-t border-white/10 pt-6 text-sm text-neutral-400">
          <Link href="/terms" className="underline underline-offset-4">Terms</Link>
          <Link href="/privacy" className="underline underline-offset-4">Privacy</Link>
          <Link href="/data-rights" className="underline underline-offset-4">Data Rights</Link>
        </footer>
      </article>
    </main>
  );
}

function Guideline({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="text-sm leading-7 text-neutral-300">{children}</div>
    </section>
  );
}
